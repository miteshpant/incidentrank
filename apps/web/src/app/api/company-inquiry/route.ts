import { NextResponse } from "next/server";
import { extractClientIp, submitCompanyInquiry } from "@/lib/server/company-inquiry";
import { recordAnalyticsEvent } from "@/lib/server/analytics";

interface CompanyInquiryBody {
  companyName?: unknown;
  name?: unknown;
  workEmail?: unknown;
  message?: unknown;
  website?: unknown;
}

/**
 * docs/implementation_plan/phase_visitor_impove.md Part 2 — public
 * (unauthenticated) company inquiry submission. Never returns Resend's
 * internal error text to the client; the analytics event records only
 * that a submission occurred, never message contents or the work email.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as CompanyInquiryBody | null;
  if (!body) {
    return NextResponse.json(
      { error: "We couldn't send your message right now. Please try again." },
      { status: 400 },
    );
  }

  const clientIp = extractClientIp(request.headers);
  const result = await submitCompanyInquiry(body, clientIp);

  if (!result.ok) {
    if (result.error === "validation") {
      return NextResponse.json({ error: "validation", fieldErrors: result.fieldErrors }, { status: 400 });
    }
    if (result.error === "rate_limited") {
      return NextResponse.json(
        { error: "We couldn't send your message right now. Please try again." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: "We couldn't send your message right now. Please try again." },
      { status: 502 },
    );
  }

  void recordAnalyticsEvent({ eventName: "company_inquiry_submitted" });

  return NextResponse.json({ ok: true });
}
