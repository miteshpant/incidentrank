import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import {
  ANALYTICS_EVENT_NAMES,
  recordAnalyticsEvent,
  type AnalyticsEventName,
} from "@/lib/server/analytics";

interface AnalyticsEventBody {
  eventName?: unknown;
  anonymousSessionId?: unknown;
  path?: unknown;
  scenarioSlug?: unknown;
  practiceOrAssessment?: unknown;
  referrer?: unknown;
  context?: unknown;
}

const ALLOWED_PRACTICE_OR_ASSESSMENT = new Set(["practice", "assessment"]);
// Spec §1 "Do NOT record" list — a client-supplied context object is
// allowlisted to a few simple, non-sensitive primitive-valued keys.
// Anything else (candidate reasoning, action values, scores, hidden
// state) is silently dropped here rather than trusted from the client.
const ALLOWED_CONTEXT_KEYS = new Set(["label", "difficulty", "category", "buttonText"]);

function sanitizeContext(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_CONTEXT_KEYS.has(key)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Public, unauthenticated event-ingestion endpoint (docs/
 * implementation_plan/phase10g.metrics.md) — anonymous visitors must be
 * able to send events, so this deliberately does NOT gate on sign-in the
 * way most routes in this app do. userId is still always derived
 * server-side from the session when one exists (never accepted from the
 * client body) to prevent a caller from attributing an event to an
 * arbitrary user id. Fire-and-forget by design (spec §11): malformed
 * input is a quiet no-op 204, never a hard error that could surface in
 * the client and interrupt the candidate's primary action — the
 * recordAnalyticsEvent call itself is also internally best-effort.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as AnalyticsEventBody | null;

  if (
    !body ||
    typeof body.eventName !== "string" ||
    !ANALYTICS_EVENT_NAMES.includes(body.eventName as AnalyticsEventName)
  ) {
    return new NextResponse(null, { status: 204 });
  }

  const user = await getOrCreateCurrentUser().catch(() => null);

  const practiceOrAssessment =
    typeof body.practiceOrAssessment === "string" &&
    ALLOWED_PRACTICE_OR_ASSESSMENT.has(body.practiceOrAssessment)
      ? (body.practiceOrAssessment as "practice" | "assessment")
      : null;

  await recordAnalyticsEvent({
    eventName: body.eventName as AnalyticsEventName,
    userId: user?.id ?? null,
    anonymousSessionId: typeof body.anonymousSessionId === "string" ? body.anonymousSessionId : null,
    path: typeof body.path === "string" ? body.path.slice(0, 500) : null,
    scenarioSlug: typeof body.scenarioSlug === "string" ? body.scenarioSlug.slice(0, 200) : null,
    practiceOrAssessment,
    referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
    context: sanitizeContext(body.context),
  });

  return new NextResponse(null, { status: 204 });
}
