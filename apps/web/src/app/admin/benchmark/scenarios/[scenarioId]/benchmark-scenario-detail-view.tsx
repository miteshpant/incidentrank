import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { calibrateDecisionPatterns, calibrateScenario } from "@/lib/server/benchmark/calibration";
import { SAMPLE_QUALITY_LABEL } from "@/lib/server/benchmark/sample-quality";

const DIMENSION_LABEL: Record<string, string> = {
  recovery: "Recovery",
  customerImpact: "Customer Impact",
  dataIntegrity: "Data Integrity",
  reliability: "Reliability",
  costEfficiency: "Cost Efficiency",
  operationalEfficiency: "Operational Efficiency",
};

export async function BenchmarkScenarioDetailView({ scenarioId }: { scenarioId: string }) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const [calibration, patterns] = await Promise.all([
    calibrateScenario(scenarioId),
    calibrateDecisionPatterns(scenarioId),
  ]);
  if (!calibration) notFound();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{calibration.scenarioSlug}</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {calibration.difficulty} · {calibration.category ?? "uncategorized"}
          </p>
        </div>
        <Link
          href="/admin/benchmark/scenarios"
          className="font-mono text-xs text-muted hover:text-foreground"
        >
          ← Scenarios
        </Link>
      </div>

      <p className="mt-4 rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-muted">
        Sample quality: <span className="text-foreground">{SAMPLE_QUALITY_LABEL[calibration.sampleQuality]}</span>{" "}
        ({calibration.firstAttempts} first attempts)
      </p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        Sample size
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Attempts" value={calibration.totalAttempts} />
        <StatCard label="First Attempts" value={calibration.firstAttempts} />
        <StatCard label="Repeat Attempts" value={calibration.repeatAttempts} />
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Outcomes</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Resolved" value={`${calibration.resolvedPct}%`} />
        <StatCard label="Declared Unstable" value={`${calibration.unstablePct}%`} />
        <StatCard label="Failed" value={`${calibration.failedPct}%`} />
        <StatCard label="Timed Out" value={`${calibration.timedOutPct}%`} />
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        Score distribution
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Median Score" value={calibration.medianScore ?? "—"} />
        <StatCard
          label="Median Duration"
          value={
            calibration.medianDurationSeconds !== null
              ? `${Math.round(calibration.medianDurationSeconds / 60)} min`
              : "—"
          }
        />
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        Dimension medians
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Object.entries(calibration.dimensionMedians).map(([key, value]) => (
          <StatCard key={key} label={DIMENSION_LABEL[key] ?? key} value={value ?? "—"} />
        ))}
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        Rank-band distribution
      </h2>
      {Object.keys(calibration.rankBandDistribution).length === 0 ? (
        <p className="mt-3 text-sm text-muted">No rank data yet.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {Object.entries(calibration.rankBandDistribution).map(([band, count]) => (
            <li
              key={band}
              className="rounded-md border border-border px-3 py-1.5 font-mono text-xs"
            >
              {band}: {count}
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        Common first actions
      </h2>
      {patterns.commonFirstActions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No action data yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {patterns.commonFirstActions.map((a) => (
            <li key={a.actionType} className="flex items-center justify-between font-mono text-xs">
              <span>{a.actionType}</span>
              <span className="text-muted">{a.count}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        Common action sequences (first 4 actions)
      </h2>
      {patterns.commonActionSequences.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No sequence data yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {patterns.commonActionSequences.map((s) => (
            <li key={s.sequence.join("|")} className="flex items-center justify-between font-mono text-xs">
              <span>{s.sequence.join(" → ")}</span>
              <span className="text-muted">{s.count}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
        High-performing first actions
      </h2>
      {patterns.highPerformingFirstActions.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Not enough samples yet (minimum 3 per action).</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {patterns.highPerformingFirstActions.map((a) => (
            <li key={a.actionType} className="flex items-center justify-between font-mono text-xs">
              <span>{a.actionType}</span>
              <span className="text-muted">
                {a.resolvedPct}% resolved ({a.count})
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
