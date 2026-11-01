import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { companyInquiries } from "@incidentrank/db";
import { db } from "./db";
import { sendCompanyInquiryEmail } from "./email";

const MAX_FIELD_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 4000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// docs/implementation_plan/phase_visitor_impove.md Part 2 — "simplest
// appropriate mechanism already available": no rate-limiting
// infrastructure exists anywhere else in this codebase, so this is a
// plain DB-row count by hashed IP over a short window. Not a general
// rate-limiter — scoped to this one form only.
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_WINDOW = 5;

export interface CompanyInquiryInput {
  companyName?: unknown;
  name?: unknown;
  workEmail?: unknown;
  message?: unknown;
  /** Honeypot field — must arrive empty from a real submitter. */
  website?: unknown;
}

export type CompanyInquiryResult =
  | { ok: true }
  | { ok: false; error: "validation"; fieldErrors: Record<string, string> }
  | { ok: false; error: "rate_limited" }
  | { ok: false; error: "send_failed" };

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}

/** Never trusts a single header blindly — takes the first hop of
 * X-Forwarded-For when present, which is adequate for a simple
 * best-effort rate limit (not a security boundary). */
export function extractClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }
  return headers.get("x-real-ip");
}

function validate(input: CompanyInquiryInput): Record<string, string> | null {
  const errors: Record<string, string> = {};

  const companyName = typeof input.companyName === "string" ? input.companyName.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const workEmail = typeof input.workEmail === "string" ? input.workEmail.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (!companyName) errors.companyName = "Company name is required.";
  else if (companyName.length > MAX_FIELD_LENGTH) errors.companyName = "Company name is too long.";

  if (!name) errors.name = "Name is required.";
  else if (name.length > MAX_FIELD_LENGTH) errors.name = "Name is too long.";

  if (!workEmail) errors.workEmail = "Work email is required.";
  else if (!EMAIL_PATTERN.test(workEmail) || workEmail.length > MAX_FIELD_LENGTH) {
    errors.workEmail = "Enter a valid email address.";
  }

  if (!message) errors.message = "Message is required.";
  else if (message.length > MAX_MESSAGE_LENGTH) errors.message = "Message is too long.";

  return Object.keys(errors).length > 0 ? errors : null;
}

async function isRateLimited(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return false;
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(companyInquiries)
    .where(and(eq(companyInquiries.ipHash, ipHash), gte(companyInquiries.createdAt, windowStart)));
  return Number(row?.value ?? 0) >= RATE_LIMIT_MAX_PER_WINDOW;
}

/**
 * The one entry point for a company inquiry submission. Honeypot and
 * validation are checked before any DB write; a honeypot hit is treated
 * identically to success from the caller's perspective (never reveals the
 * anti-spam mechanism to a bot) but performs no insert and no send.
 */
export async function submitCompanyInquiry(
  input: CompanyInquiryInput,
  clientIp: string | null,
): Promise<CompanyInquiryResult> {
  // Honeypot: a real visitor never fills this hidden field.
  if (typeof input.website === "string" && input.website.trim().length > 0) {
    return { ok: true };
  }

  const fieldErrors = validate(input);
  if (fieldErrors) {
    return { ok: false, error: "validation", fieldErrors };
  }

  const ipHash = clientIp ? hashIp(clientIp) : null;
  if (await isRateLimited(ipHash)) {
    return { ok: false, error: "rate_limited" };
  }

  const companyName = (input.companyName as string).trim();
  const name = (input.name as string).trim();
  const workEmail = (input.workEmail as string).trim();
  const message = (input.message as string).trim();
  const submittedAt = new Date();

  const sendResult = await sendCompanyInquiryEmail({
    to: "support@incidentrank.com",
    replyTo: workEmail,
    companyName,
    name,
    workEmail,
    message,
    submittedAt,
  });

  await db.insert(companyInquiries).values({
    companyName,
    name,
    workEmail,
    message,
    ipHash,
    emailSent: sendResult.ok,
    createdAt: submittedAt,
  });

  if (!sendResult.ok) {
    return { ok: false, error: "send_failed" };
  }
  return { ok: true };
}
