"use client";

import type { AnalyticsEventName } from "@/lib/server/analytics";

const ANONYMOUS_SESSION_COOKIE = "ir_asid";
const ANONYMOUS_SESSION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // ~6 months

/**
 * Phase 10G — a minimal anonymous-visitor identifier (docs/
 * implementation_plan/phase10g.metrics.md §2: "simple anonymous session
 * ID using an appropriate cookie/local identifier... do not build
 * complex identity stitching"). First-party, non-httpOnly (read/written
 * from client JS only — no server-side identity decision ever depends on
 * it), SameSite=Lax. Deliberately NOT tied to the signed-in user id in
 * any persisted way: once a visitor signs in, future events carry the
 * real userId instead (set server-side from the session, see the
 * /api/analytics/events route) — this cookie is only a before-sign-in
 * continuity thread, per spec §2's explicit scope limit.
 */
export function getOrCreateAnonymousSessionId(): string {
  if (typeof document === "undefined") return "";

  const existing = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${ANONYMOUS_SESSION_COOKIE}=`))
    ?.split("=")[1];
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  document.cookie = `${ANONYMOUS_SESSION_COOKIE}=${id}; path=/; max-age=${ANONYMOUS_SESSION_MAX_AGE_SECONDS}; SameSite=Lax`;
  return id;
}

export interface TrackEventOptions {
  path?: string;
  scenarioSlug?: string;
  practiceOrAssessment?: "practice" | "assessment";
  referrer?: string;
  context?: Record<string, string | number | boolean>;
}

/**
 * Fire-and-forget event submission (spec §11: "tracking must not block
 * the candidate experience... analytics failures should never prevent
 * page load, incident start, candidate action, Finish, signup").
 * `keepalive: true` lets the request outlive a navigation the event is
 * racing against (e.g. clicking Finish and immediately routing away);
 * the .catch swallows any network failure silently — there is
 * deliberately no retry/queue, matching the spec's "do not over-engineer"
 * instruction.
 */
export function trackEvent(eventName: AnalyticsEventName, options: TrackEventOptions = {}): void {
  if (typeof window === "undefined") return;

  try {
    fetch("/api/analytics/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventName,
        anonymousSessionId: getOrCreateAnonymousSessionId(),
        path: options.path ?? window.location.pathname,
        scenarioSlug: options.scenarioSlug,
        practiceOrAssessment: options.practiceOrAssessment,
        referrer: options.referrer ?? (document.referrer || undefined),
        context: options.context,
      }),
    }).catch(() => {
      // Best-effort only — never surface a tracking failure to the user.
    });
  } catch {
    // Synchronous failures (e.g. fetch unavailable) are equally non-fatal.
  }
}
