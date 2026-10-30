import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { listScenarioCalibrationSummaries } from "@/lib/server/benchmark/calibration";
import { SAMPLE_QUALITY_LABEL } from "@/lib/server/benchmark/sample-quality";

export async function BenchmarkScenariosView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const rows = await listScenarioCalibrationSummaries();

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Scenario Calibration</h1>
        <Link href="/admin/benchmark" className="font-mono text-xs text-muted hover:text-foreground">
          ← Overview
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          No scenarios have any benchmark evidence yet.
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Scenario</th>
                <th className="pb-2 pr-4">Difficulty</th>
                <th className="pb-2 pr-4">Category</th>
                <th className="pb-2 pr-4">First Attempts</th>
                <th className="pb-2 pr-4">Total Attempts</th>
                <th className="pb-2 pr-4">Resolved %</th>
                <th className="pb-2 pr-4">Median Score</th>
                <th className="pb-2 pr-4">Median Duration</th>
                <th className="pb-2">Evidence Status</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, b) => b.totalAttempts - a.totalAttempts)
                .map((row) => (
                  <tr key={row.scenarioId} className="border-b border-border">
                    <td className="py-2 pr-4">
                      <Link
                        href={`/admin/benchmark/scenarios/${row.scenarioId}`}
                        className="underline hover:text-foreground"
                      >
                        {row.scenarioSlug}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted">{row.difficulty}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted">{row.category ?? "—"}</td>
                    <td className="py-2 pr-4">{row.firstAttempts}</td>
                    <td className="py-2 pr-4">{row.totalAttempts}</td>
                    <td className="py-2 pr-4">{row.resolvedPct}%</td>
                    <td className="py-2 pr-4">{row.medianScore ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {row.medianDurationSeconds !== null
                        ? `${Math.round(row.medianDurationSeconds / 60)} min`
                        : "—"}
                    </td>
                    <td className="py-2 font-mono text-xs text-muted">
                      {SAMPLE_QUALITY_LABEL[row.sampleQuality]}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
