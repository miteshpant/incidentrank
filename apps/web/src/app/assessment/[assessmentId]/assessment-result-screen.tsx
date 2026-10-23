"use client";

import Link from "next/link";
import type { SimulationState } from "@incidentrank/simulator";
import type { ServerScoreResult } from "@/lib/attempt-persistence";
import { formatElapsed, formatUsd } from "@/lib/format";

const SCORE_DIMENSION_LABELS: Record<string, string> = {
  recovery: "Recovery",
  customerImpact: "Customer Impact",
  dataIntegrity: "Data Integrity",
  reliability: "Reliability",
  costEfficiency: "Cost Efficiency",
  operationalEfficiency: "Operational Efficiency",
};

/** Fixed per-dimension maximums — identical for built-in and authored
 * scoring (validateAuthoredScenario requires these exact maxPoints per
 * dimension, see packages/scenarios/src/authoring/validate.ts). */
const SCORE_DIMENSION_MAX: Record<string, number> = {
  recovery: 300,
  customerImpact: 200,
  dataIntegrity: 200,
  reliability: 150,
  costEfficiency: 100,
  operationalEfficiency: 50,
};

const SCORE_DIMENSION_ORDER = [
  "recovery",
  "customerImpact",
  "dataIntegrity",
  "reliability",
  "costEfficiency",
  "operationalEfficiency",
];

const OUTCOME_LABEL: Record<"resolved" | "failed" | "declared_unstable", string> = {
  resolved: "Incident Resolved",
  failed: "Incident Failed",
  declared_unstable: "Incident Not Fully Stabilized",
};

interface AssessmentResultScreenProps {
  state: SimulationState;
  /** Server-computed score — never recomputed client-side. Scoring bands
   * (built-in or authored) must never be trusted from/recomputed in the
   * browser for an assessment attempt. Null while the /complete request
   * is still in flight or if it failed. */
  serverScore: ServerScoreResult | null;
  /** True if the server-side scoring fetch failed — serverScore stays
   * null until a retry succeeds. */
  scoringError?: boolean;
  retryScoring?: () => void;
  /** Phase 6.1: the server's actual completion decision — authoritative
   * whenever present, since it's the only field that correctly
   * represents a candidate_declared scenario's declared_unstable result
   * (state.status alone cannot). Null for legacy/automatic callers,
   * which fall back to state.status. */
  outcome?: "resolved" | "failed" | "declared_unstable" | null;
  completionTier?: "optimal" | "acceptable" | null;
}

/**
 * Candidate-facing assessment result. Deliberately does not render a "Try
 * Again" control (one official assessment attempt only), does not show the
 * company's view of other candidates, and does not link to the public
 * leaderboard — per Phase 4's candidate-result constraints. Renders only
 * the server-computed score (see serverScore prop) — this is the one
 * place in the candidate UI that must never recompute a score itself.
 */
export function AssessmentResultScreen({
  state,
  serverScore,
  scoringError,
  retryScoring,
  outcome,
  completionTier,
}: AssessmentResultScreenProps) {
  const effectiveOutcome =
    outcome ??
    (state.status === "resolved" || state.status === "failed" ? state.status : "declared_unstable");
  const resolved = effectiveOutcome === "resolved";
  const recoveryTimeMs =
    state.incidentStartedAtMs !== null &&
    (state.resolvedAtMs !== null || state.failedAtMs !== null)
      ? (state.resolvedAtMs ?? state.failedAtMs ?? 0) - state.incidentStartedAtMs
      : state.incidentStartedAtMs !== null
        ? state.simulationTimeMs - state.incidentStartedAtMs
        : 0;

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <span
          className={`font-mono text-xs font-semibold uppercase tracking-widest ${
            resolved ? "text-accent" : "text-[#dc2626]"
          }`}
        >
          Assessment Complete
        </span>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {OUTCOME_LABEL[effectiveOutcome]}
        </h1>

        {effectiveOutcome === "declared_unstable" && (
          <p className="mt-2 text-sm text-muted">
            You ended the incident while important reliability conditions were
            still degraded.
          </p>
        )}

        {resolved && completionTier === "acceptable" && (
          <p className="mt-2 text-sm text-muted">
            The system reached a stable, acceptable handback state — some
            metrics remained imperfect by design.
          </p>
        )}

        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            IncidentRank Score
          </p>
          {serverScore ? (
            <>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {serverScore.total}{" "}
                <span className="text-lg font-normal text-muted">/ 1000</span>
              </p>

              <dl className="mt-6 flex flex-col gap-2">
                {SCORE_DIMENSION_ORDER.map((dimension) => (
                  <div key={dimension} className="flex justify-between text-sm">
                    <dt className="text-muted">{SCORE_DIMENSION_LABELS[dimension]}</dt>
                    <dd className="font-mono">
                      {serverScore.breakdown[dimension] ?? 0} / {SCORE_DIMENSION_MAX[dimension]}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : scoringError ? (
            <div className="mt-1">
              <p className="text-sm text-[#dc2626]">
                We couldn&apos;t load your score. Your attempt was saved.
              </p>
              {retryScoring && (
                <button
                  type="button"
                  onClick={retryScoring}
                  className="mt-2 rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">Calculating your score…</p>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <div className="flex items-baseline justify-between border-b border-border py-3">
            <span className="text-sm text-muted">
              {resolved
                ? "Recovery Time"
                : effectiveOutcome === "failed"
                  ? "Time to Failure"
                  : "Time to Declaration"}
            </span>
            <span className="font-mono text-sm">{formatElapsed(recoveryTimeMs)}</span>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <span className="text-sm text-muted">Estimated Revenue Impact</span>
            <span className="font-mono text-sm">
              {formatUsd(state.customerImpact.revenueLossUsd)}
            </span>
          </div>
        </div>

        <p className="mt-6 text-xs text-muted">
          This result, your actions, your reasoning, and the incident
          timeline have been shared with the organization that invited you.
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
