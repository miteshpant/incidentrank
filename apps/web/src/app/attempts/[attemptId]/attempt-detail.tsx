import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import type { ControlValue } from "@incidentrank/simulator";
import { SCORE_MAX } from "@incidentrank/scoring";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOwnedAttempt } from "@/lib/server/load-owned-attempt";
import { CONTROL_LABELS, formatControlValue } from "@/lib/payment-retry-storm-ui";
import { formatElapsed, formatNumber, formatUsd } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In Progress",
  resolved: "Resolved",
  failed: "Failed",
  abandoned: "Abandoned",
};

const SCORE_DIMENSION_LABELS: Array<{
  key: keyof typeof SCORE_MAX;
  field: keyof typeof attempts.$inferSelect;
  label: string;
}> = [
  { key: "recovery", field: "recoveryScore", label: "Recovery" },
  { key: "customerImpact", field: "customerImpactScore", label: "Customer Impact" },
  { key: "dataIntegrity", field: "dataIntegrityScore", label: "Data Integrity" },
  { key: "reliability", field: "reliabilityScore", label: "Reliability" },
  { key: "costEfficiency", field: "costEfficiencyScore", label: "Cost Efficiency" },
  {
    key: "operationalEfficiency",
    field: "operationalEfficiencyScore",
    label: "Operational Efficiency",
  },
];

function controlLabel(controlKey: string): string {
  return CONTROL_LABELS[controlKey] ?? controlKey;
}

interface AttemptDetailProps {
  attemptId: string;
}

export async function AttemptDetail({ attemptId }: AttemptDetailProps) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }

  const owned = await loadOwnedAttempt(attemptId, user);
  if (!owned.ok) {
    notFound();
  }

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: {
      scenario: true,
      actionGroups: {
        orderBy: (table, { asc }) => [asc(table.sequence)],
        with: {
          changes: { orderBy: (table, { asc }) => [asc(table.sequence)] },
        },
      },
      events: { orderBy: (table, { asc }) => [asc(table.sequence)] },
    },
  });

  if (!attempt) {
    notFound();
  }

  const SYSTEM_ONLY_EVENT_TYPES = new Set([
    "CONFIG_CHANGED",
    "CONFIG_CHANGE_REJECTED",
  ]);

  const timeline = [
    ...attempt.actionGroups.map((group) => ({
      kind: "you" as const,
      elapsedMs: group.elapsedMs,
      group,
    })),
    ...attempt.events
      .filter((event) => !SYSTEM_ONLY_EVENT_TYPES.has(event.type))
      .map((event) => ({
        kind: "system" as const,
        elapsedMs: event.elapsedMs,
        event,
      })),
  ].sort((a, b) => a.elapsedMs - b.elapsedMs);

  return (
    <>
      <Link href="/attempts" className="font-mono text-xs text-muted hover:text-foreground">
        ← Back to attempts
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {attempt.scenario.name}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {attempt.createdAt.toLocaleString()} ·{" "}
        {STATUS_LABEL[attempt.status] ?? attempt.status} · scenario v
        {attempt.scenarioVersion}
      </p>

      {attempt.score !== null && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-6">
          <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
            IncidentRank
          </p>
          <p className="mt-1 text-4xl font-semibold tracking-tight">
            {attempt.score}{" "}
            <span className="text-lg font-normal text-muted">/ 1000</span>
          </p>

          <dl className="mt-6 flex flex-col gap-2">
            {SCORE_DIMENSION_LABELS.map(({ key, field, label }) => (
              <div key={key} className="flex justify-between text-sm">
                <dt className="text-muted">{label}</dt>
                <dd className="font-mono">
                  {String(attempt[field] ?? 0)} / {SCORE_MAX[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mt-6 rounded-lg border border-border bg-surface p-6">
        <div className="flex justify-between border-b border-border py-2 text-sm">
          <span className="text-muted">Recovery Time</span>
          <span className="font-mono">
            {attempt.recoveryTimeMs !== null
              ? formatElapsed(attempt.recoveryTimeMs)
              : "—"}
          </span>
        </div>
        <div className="flex justify-between border-b border-border py-2 text-sm">
          <span className="text-muted">Estimated Revenue Impact</span>
          <span className="font-mono">
            {attempt.revenueLossUsd !== null
              ? formatUsd(attempt.revenueLossUsd)
              : "—"}
          </span>
        </div>
        <div className="flex justify-between border-b border-border py-2 text-sm">
          <span className="text-muted">Configuration Changes</span>
          <span className="font-mono">
            {attempt.numberOfConfigurationChanges !== null
              ? formatNumber(attempt.numberOfConfigurationChanges)
              : "—"}
          </span>
        </div>
        <div className="flex justify-between py-2 text-sm">
          <span className="text-muted">Peak Infrastructure Cost</span>
          <span className="font-mono">
            {attempt.peakInfrastructureCostUsd !== null
              ? `${formatUsd(attempt.peakInfrastructureCostUsd)}/mo`
              : "—"}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Event Timeline
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          {timeline.length === 0 && (
            <li className="text-sm text-muted">No events recorded.</li>
          )}
          {timeline.map((item) =>
            item.kind === "you" ? (
              <li
                key={`group-${item.group.id}`}
                className="rounded-md border border-border bg-surface p-4 text-sm"
              >
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted">
                  <span>{formatElapsed(item.elapsedMs)}</span>
                  <span className="rounded border border-accent px-1.5 py-0.5 text-accent">
                    You
                  </span>
                </div>
                <dl className="mt-2 flex flex-col gap-1">
                  {item.group.changes.map((change) => (
                    <div key={change.id} className="flex justify-between text-sm">
                      <dt className="text-muted">
                        {controlLabel(change.controlKey)}
                      </dt>
                      <dd className="font-mono">
                        {formatControlValue(
                          change.controlKey,
                          change.previousValueJson as ControlValue,
                        )}{" "}
                        {"→"}{" "}
                        {formatControlValue(
                          change.controlKey,
                          change.newValueJson as ControlValue,
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {item.group.reasoning && (
                  <p className="mt-3 text-muted">
                    <span className="font-mono text-[10px] uppercase tracking-wide">
                      Reason
                    </span>
                    <br />
                    <span className="italic">
                      &ldquo;{item.group.reasoning}&rdquo;
                    </span>
                  </p>
                )}
              </li>
            ) : (
              <li key={`event-${item.event.id}`} className="text-sm">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted">
                  <span>{formatElapsed(item.elapsedMs)}</span>
                  <span className="rounded border border-border px-1.5 py-0.5">
                    System
                  </span>
                </div>
                <p className="mt-1 text-foreground">{item.event.message}</p>
              </li>
            ),
          )}
        </ol>
      </div>
    </>
  );
}
