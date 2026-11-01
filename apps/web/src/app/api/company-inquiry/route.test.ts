import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { analyticsEvents, companyInquiries, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

type SendResult = { ok: true } | { ok: false; error: string };
const sendMock = vi.fn<(input: unknown) => Promise<SendResult>>(async () => ({ ok: true }));
vi.mock("@/lib/server/email", () => ({
  sendCompanyInquiryEmail: (input: unknown) => sendMock(input),
}));

const TEST_PREFIX = "test-inquiry-route-";

function uniqueCompany(): string {
  return `${TEST_PREFIX}${crypto.randomUUID().slice(0, 8)}`;
}

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/company-inquiry", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.9" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/company-inquiry", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    sendMock.mockClear();
    sendMock.mockResolvedValue({ ok: true });
  });

  afterEach(async () => {
    await testDb.delete(companyInquiries).where(like(companyInquiries.companyName, `${TEST_PREFIX}%`));
    await testDb.delete(analyticsEvents).where(eq(analyticsEvents.eventName, "company_inquiry_submitted"));
  });

  afterAll(async () => {
    await testDb.$client.end({ timeout: 1 });
  });

  it("accepts a valid submission and returns 200", async () => {
    const response = await POST(
      postRequest({
        companyName: uniqueCompany(),
        name: "Jane Doe",
        workEmail: "jane@example.com",
        message: "We'd like to learn more.",
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 400 with per-field errors for an invalid submission", async () => {
    const response = await POST(postRequest({ companyName: "", name: "", workEmail: "", message: "" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("validation");
    expect(body.fieldErrors.companyName).toBeTruthy();
  });

  it("never exposes the raw provider error on send failure", async () => {
    sendMock.mockResolvedValueOnce({ ok: false, error: "Resend: invalid API key xyz123" });
    const response = await POST(
      postRequest({
        companyName: uniqueCompany(),
        name: "Jane",
        workEmail: "jane@example.com",
        message: "Hello",
      }),
    );
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).not.toContain("Resend");
    expect(body.error).not.toContain("xyz123");
  });

  it("returns 400 for a malformed JSON body", async () => {
    const request = new Request("http://localhost/api/company-inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
