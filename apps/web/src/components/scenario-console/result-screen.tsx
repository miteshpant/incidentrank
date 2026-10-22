"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import type { SimulationState } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import type { CandidateActionGroup } from "@/lib/use-incident-attempt";
import type { ServerScoreResult } from "@/lib/attempt-persistence";
import { formatElapsed, formatNumber, formatUsd } from "@/lib/format";

const SEVERITY_RANK_LABEL = ["Normal", "Warning", "Critical"];

const SCORE_DIMENSION_LABELS: Record<string, string> = {
  recovery: "Recovery",
  customerImpact: "Customer Impact",
  dataIntegrity: "Data Integrity",
  reliability: "Reliability",
  costEfficiency: "Cost Efficiency",
  operationalEfficiency: "Operational Efficiency",
};

const SCORE_DIMENSION_MAX: Record<string, number> = {
  recovery: 300,
  customerImpact: 200,
  dataIntegrity: 200,
  reliability: 150,
  costEfficiency: 100,
  operationalEfficiency: 50,
};

interface GenericResultScreenProps {
  state: SimulationState;
  actionGroups: CandidateActionGroup[];
  descriptor: CandidateUIDescriptor;
  serverScore: ServerScoreResult | null;
  onTryAgain: () => void;
  showSignInNudge: boolean;
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border py-3 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-sm">{value}</span>
    </div>
  );
}

function ActionGroupCard({
  group,
  descriptor,
}: {
  group: CandidateActionGroup;
  descriptor: CandidateUIDescriptor;
}) {
  const controlLabel = (controlKey: string): string =>
    descriptor.controls.find((c) => c.key === controlKey)?.label ?? controlKey;
  const valueLabel = (controlKey: string, value: unknown): string => {
    const control = descriptor.controls.find((c) => c.key === controlKey);
    return control?.valueLabels?.[String(value)] ?? String(value);
  };

  return (
    <li className="rounded-md border border-border bg-surface p-4">
      <span className="font-mono text-xs text-muted tabular-nums">
        {formatElapsed(group.elapsedMs)}
      </span>
      <dl className="mt-2 flex flex-col gap-1">
        {group.changes.map((change) => (
          <div key={change.controlKey} className="flex justify-between text-sm">
            <dt className="text-muted">{controlLabel(change.controlKey)}</dt>
            <dd className="font-mono">
              {valueLabel(change.controlKey, change.previousValue)} {"→"}{" "}
              {valueLabel(change.controlKey, change.newValue)}
            </dd>
          </div>
        ))}
      </dl>
      {group.reasoning && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-mono text-[10px] uppercase tracking-wide">
            Reason
          </span>
          <br />
          <span className="italic">&ldquo;{group.reasoning}&rdquo;</span>
        </p>
      )}
    </li>
  );
}

/**
 * Candidate-facing practice result screen, generic over any built-in
 * scenario (CandidateUIDescriptor drives control labels, same pattern as
 * GenericComponentPanel/GenericTimelinePanel). The score shown is ALWAYS
 * the server-computed `serverScore` — never recomputed in the browser
 * from a scoring config — per docs/implementation_plan/phase6.md's
 * scoring-convergence mandate. `serverScore` arrives via
 * completeAttemptRecord (signed-in) or requestScorePreview (anonymous);
 * see use-incident-attempt.ts. While the server round-trip is still in
 * flight, this renders a "Scoring…" placeholder rather than a locally
 * computed number — the browser never owns scoring, even temporarily.
 */
export function GenericResultScreen({
  state,
  actionGroups,
  descriptor,
  serverScore,
  onTryAgain,
  showSignInNudge,
}: GenericResultScreenProps) {
  const resolved = state.status === "resolved";
  const recoveryTimeMs =
    state.incidentStartedAtMs !== null &&
    (state.resolvedAtMs !== null || state.failedAtMs !== null)
      ? (state.resolvedAtMs ?? state.failedAtMs ?? 0) - state.incidentStartedAtMs
      : 0;

  const peakNumericEntries = Object.entries(state.peaks.peakValues).filter(
    ([key]) => key in state.values,
  );

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <span
          className={`font-mono text-xs font-semibold uppercase tracking-widest ${
            resolved ? "text-accent" : "text-[#dc2626]"
          }`}
        >
          {resolved ? "Incident Resolved" : "Incident Failed"}
        </span>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Incident Result
        </h1>

        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            IncidentRank
          </p>
          {serverScore ? (
            <>
              <p className="mt-1 text-4xl font-semibold tracking-tight">
                {serverScore.total}{" "}
                <span className="text-lg font-normal text-muted">/ 1000</span>
              </p>

              <dl className="mt-6 flex flex-col gap-2">
                {Object.entries(SCORE_DIMENSION_LABELS).map(([dimension, label]) => (
                  <div key={dimension} className="flex justify-between text-sm">
                    <dt className="text-muted">{label}</dt>
                    <dd className="font-mono">
                      {serverScore.breakdown[dimension] ?? 0} /{" "}
                      {SCORE_DIMENSION_MAX[dimension]}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">Scoring…</p>
          )}
        </div>

        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <StatRow
            label={resolved ? "Recovery Time" : "Time to Failure"}
            value={formatElapsed(recoveryTimeMs)}
          />
          <StatRow
            label="Estimated Revenue Impact"
            value={formatUsd(state.customerImpact.revenueLossUsd)}
          />
          <StatRow
            label="Configuration Changes"
            value={formatNumber(state.numberOfConfigurationChanges)}
          />
          <StatRow
            label="Beneficial Changes"
            value={formatNumber(state.numberOfBeneficialChanges)}
          />
          <StatRow
            label="Harmful Changes"
            value={formatNumber(state.numberOfHarmfulChanges)}
          />
          <StatRow
            label="Peak Severity"
            value={SEVERITY_RANK_LABEL[state.peaks.peakSeverityRank] ?? "Normal"}
          />
          <StatRow
            label="Peak Infrastructure Cost"
            value={`${formatUsd(state.peaks.peakMonthlyCostUsd)}/mo`}
          />
          {peakNumericEntries.map(([key, value]) => {
            const metric = descriptor.metrics.find((m) => m.sourceStateKey === key);
            return (
              <StatRow
                key={key}
                label={`Peak ${metric?.label ?? key}`}
                value={formatNumber(value)}
              />
            );
          })}
        </div>

        {actionGroups.length > 0 && (
          <div className="mt-6">
            <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
              Your Actions
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {actionGroups.map((group) => (
                <ActionGroupCard key={group.id} group={group} descriptor={descriptor} />
              ))}
            </ol>
          </div>
        )}

        {showSignInNudge && (
          <p className="mt-6 text-xs text-muted">
            This was a guest attempt — your score wasn&apos;t saved.{" "}
            <SignInButton mode="modal">
              <button type="button" className="underline hover:text-foreground">
                Sign in
              </button>
            </SignInButton>{" "}
            to save future attempts and appear on the leaderboard.
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onTryAgain}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Try Again
          </button>
          <Link
            href="/incidents"
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
          >
            Back to Incidents
          </Link>
          {!showSignInNudge && (
            <Link
              href="/attempts"
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              View Attempt History
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
