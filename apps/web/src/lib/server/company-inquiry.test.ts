import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { like } from "drizzle-orm";
import { companyInquiries, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { extractClientIp, submitCompanyInquiry } from "./company-inquiry";

type SendResult = { ok: true } | { ok: false; error: string };
const sendMock = vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ ok: true }));
vi.mock("./email", () => ({
  sendCompanyInquiryEmail: (input: unknown) => sendMock(input),
}));

/**
 * docs/implementation_plan/phase_visitor_impove.md Part 2 — "focused, not
 * an enormous suite." Real Postgres, matching analytics.test.ts's
 * convention. Scoped by a distinct companyName prefix per test run.
 */
let testDb: Db;
const TEST_PREFIX = "test-inquiry-";

function uniqueCompany(): string {
  return `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

beforeAll(async () => {
  testDb = createDb();
});

beforeEach(() => {
  sendMock.mockClear();
  sendMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await testDb.delete(companyInquiries).where(like(companyInquiries.companyName, `${TEST_PREFIX}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

describe("submitCompanyInquiry", () => {
  it("inserts a row and sends the email with reply-to set to the submitted work email", async () => {
    const companyName = uniqueCompany();
    const result = await submitCompanyInquiry(
      { companyName, name: "Jane Doe", workEmail: "jane@example.com", message: "Hello there" },
      "203.0.113.5",
    );

    expect(result).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sentInput = sendMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sentInput.to).toBe("support@incidentrank.com");
    expect(sentInput.replyTo).toBe("jane@example.com");

    const row = await testDb.query.companyInquiries.findFirst({
      where: (fields, { eq }) => eq(fields.companyName, companyName),
    });
    expect(row).toBeDefined();
    expect(row?.emailSent).toBe(true);
    expect(row?.ipHash).toBeTruthy();
    expect(row?.ipHash).not.toBe("203.0.113.5");
  });

  it("rejects missing required fields with per-field validation errors, without sending or inserting", async () => {
    const result = await submitCompanyInquiry(
      { companyName: "", name: "", workEmail: "", message: "" },
      "203.0.113.5",
    );

    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "validation") {
      expect(result.fieldErrors.companyName).toBeTruthy();
      expect(result.fieldErrors.name).toBeTruthy();
      expect(result.fieldErrors.workEmail).toBeTruthy();
      expect(result.fieldErrors.message).toBeTruthy();
    } else {
      throw new Error("expected a validation error");
    }
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed email address", async () => {
    const result = await submitCompanyInquiry(
      { companyName: uniqueCompany(), name: "Jane", workEmail: "not-an-email", message: "Hi" },
      "203.0.113.5",
    );
    expect(result.ok).toBe(false);
    if (!result.ok && result.error === "validation") {
      expect(result.fieldErrors.workEmail).toBeTruthy();
    } else {
      throw new Error("expected a validation error");
    }
  });

  it("silently no-ops on a filled honeypot field, never inserting or sending", async () => {
    const companyName = uniqueCompany();
    const result = await submitCompanyInquiry(
      {
        companyName,
        name: "Bot",
        workEmail: "bot@example.com",
        message: "spam",
        website: "http://spam.example.com",
      },
      "203.0.113.5",
    );

    expect(result).toEqual({ ok: true });
    expect(sendMock).not.toHaveBeenCalled();
    const row = await testDb.query.companyInquiries.findFirst({
      where: (fields, { eq }) => eq(fields.companyName, companyName),
    });
    expect(row).toBeUndefined();
  });

  it("marks emailSent false and returns send_failed when the email provider fails, but still records the inquiry", async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: "provider down" });
    const companyName = uniqueCompany();

    const result = await submitCompanyInquiry(
      { companyName, name: "Jane", workEmail: "jane@example.com", message: "Hello" },
      "203.0.113.5",
    );

    expect(result).toEqual({ ok: false, error: "send_failed" });
    const row = await testDb.query.companyInquiries.findFirst({
      where: (fields, { eq }) => eq(fields.companyName, companyName),
    });
    expect(row).toBeDefined();
    expect(row?.emailSent).toBe(false);
  });

  it("rate-limits repeated submissions from the same IP within the window", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    for (let i = 0; i < 5; i++) {
      const result = await submitCompanyInquiry(
        { companyName: uniqueCompany(), name: "Jane", workEmail: "jane@example.com", message: "Hi" },
        ip,
      );
      expect(result.ok).toBe(true);
    }

    const sixth = await submitCompanyInquiry(
      { companyName: uniqueCompany(), name: "Jane", workEmail: "jane@example.com", message: "Hi" },
      ip,
    );
    expect(sixth).toEqual({ ok: false, error: "rate_limited" });
  });
});

describe("extractClientIp", () => {
  it("reads the first hop of X-Forwarded-For", () => {
    const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
    expect(extractClientIp(headers)).toBe("198.51.100.1");
  });

  it("falls back to X-Real-IP when X-Forwarded-For is absent", () => {
    const headers = new Headers({ "x-real-ip": "198.51.100.2" });
    expect(extractClientIp(headers)).toBe("198.51.100.2");
  });

  it("returns null when neither header is present", () => {
    expect(extractClientIp(new Headers())).toBeNull();
  });
});
