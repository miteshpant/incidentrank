"use client";

import { SignInButton } from "@clerk/nextjs";
import type { ArchitectureDefinition } from "@incidentrank/simulator";
import type { ScenarioDefinition } from "@incidentrank/scenarios";
import { BriefingContent } from "./briefing-content";

interface GenericBriefingScreenProps {
  scenario: ScenarioDefinition;
  architecture: ArchitectureDefinition;
  onAcknowledge: () => void;
  showSignInNudge: boolean;
}

/**
 * Candidate-facing pre-incident briefing/detail preview, generic over
 * any built-in scenario's own ScenarioDefinition metadata (name/
 * description/difficulty/estimatedMinutes/library.category/library.
 * skills/isFree) rather than hardcoded per-scenario copy — see
 * docs/implementation_plan/phase6.md's "Scenario Detail / Briefing
 * Preview": candidate-safe only (name, difficulty, category, time,
 * skills, description, architecture topology, free/paid status). Never
 * reveals rules, solutions, success/failure thresholds, scoring bands,
 * or hidden events — the architecture preview shows node/edge topology
 * only (the same ArchitectureView already rendered live during an
 * active incident), never rule logic or component health thresholds.
 *
 * A thin wrapper around BriefingContent (Phase 7.1) — the SEV/paid
 * badges and the Acknowledge/sign-in affordances are pre-start-only
 * concerns; the actual candidate-safe content is shared verbatim with
 * the post-start Incident Brief so the two can never drift.
 */
export function GenericBriefingScreen({
  scenario,
  architecture,
  onAcknowledge,
  showSignInNudge,
}: GenericBriefingScreenProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded border border-[#dc2626] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#dc2626]">
            SEV-1
          </span>
          <span
            className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
              scenario.isFree ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {scenario.isFree ? "Free" : "🔒 Paid"}
          </span>
        </div>

        <div className="mt-4">
          <BriefingContent scenario={scenario} architecture={architecture} />
        </div>

        {showSignInNudge && (
          <p className="mt-6 text-xs text-muted">
            Playing as a guest — your score won&apos;t be saved or appear on
            the leaderboard.{" "}
            <SignInButton mode="modal">
              <button type="button" className="underline hover:text-foreground">
                Sign in
              </button>
            </SignInButton>{" "}
            to save this attempt.
          </p>
        )}

        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-8 w-full rounded-md border border-foreground bg-foreground px-4 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Acknowledge Incident
        </button>
      </div>
    </main>
  );
}
