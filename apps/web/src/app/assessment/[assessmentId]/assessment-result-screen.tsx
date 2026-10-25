"use client";

import Link from "next/link";

/**
 * Candidate-facing assessment result. Per the Phase 7.1 candidate
 * score-privacy doctrine (docs/implementation_plan/phase7.action.md's
 * "Company-assessment candidates must not see evaluation results"), a
 * company-assessment candidate must never receive total score, any
 * dimension breakdown, completion tier, outcome, completion note, final-
 * state details, revenue-loss details, peak metrics, or action tallies —
 * the candidate experience is equivalent to "Assessment submitted
 * successfully. Results are available to the hiring organization."
 *
 * This component intentionally takes no score/outcome/state props at
 * all — there is no evaluation-derived data left to accidentally render.
 * Deliberately does not render a "Try Again" control (one official
 * assessment attempt only), does not show the company's view of other
 * candidates, and does not link to the public leaderboard — per Phase
 * 4's candidate-result constraints.
 */
export function AssessmentResultScreen() {
  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          Assessment Complete
        </span>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Assessment submitted successfully.
        </h1>

        <p className="mt-2 text-sm text-muted">
          Results are available to the hiring organization.
        </p>

        <p className="mt-6 text-xs text-muted">
          Your actions, reasoning, and the incident timeline have been
          shared with the organization that invited you.
        </p>

        <div className="mt-8">
          <Link
            href="/"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Back to IncidentRank
          </Link>
        </div>
      </div>
    </main>
  );
}
