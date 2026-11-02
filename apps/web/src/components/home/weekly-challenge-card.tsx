"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { trackEvent } from "@/lib/analytics";

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

/**
 * docs/implementation_plan/phase-challege-version.md §1/§14 — one
 * compact element near the hero CTA, never a large section. Fires
 * weekly_challenge_viewed once per real mount (ref-guarded against
 * Strict Mode double-invoke, same pattern as PageViewTracker) and
 * try_free_incident_clicked-style tracking on the CTA click via
 * weekly_challenge_started.
 */
export function WeeklyChallengeCard({
  scenarioSlug,
  scenarioName,
  difficulty,
}: {
  scenarioSlug: string;
  scenarioName: string;
  difficulty: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackEvent("weekly_challenge_viewed", { scenarioSlug });
  }, [scenarioSlug]);

  return (
    <div className="mt-8 max-w-md rounded-md border border-border bg-surface p-5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
        Weekly Challenge
      </p>
      <p className="mt-2 text-base font-semibold tracking-tight">{scenarioName}</p>
      <p className="mt-1 font-mono text-xs text-muted">
        {DIFFICULTY_LABEL[difficulty] ?? difficulty} · Free this week
      </p>
      <p className="mt-3 text-sm text-muted">Can you stabilize production?</p>
      <Link
        href={`/incidents/${scenarioSlug}`}
        onClick={() => trackEvent("weekly_challenge_started", { scenarioSlug })}
        className="mt-4 inline-flex items-center font-mono text-sm underline hover:text-foreground"
      >
        Take the Challenge →
      </Link>
    </div>
  );
}
