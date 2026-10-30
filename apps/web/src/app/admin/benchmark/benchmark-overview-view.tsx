import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { getBenchmarkOverallMetrics } from "@/lib/server/benchmark/calibration";

/**
 * Platform-admin-only benchmark overview (docs/implementation_plan/
 * phase10e.md §32). Same gate pattern as every other admin page —
 * isAdminPortalEnabled() -> notFound(), getOrCreateCurrentUser(),
 * loadAdminMembership() -> notFound(). No engineer PII anywhere on this
 * page (§33/§954) — the numbers below are pure aggregates, never a
 * per-engineer breakdown.
 */
export async function BenchmarkOverviewView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const metrics = await getBenchmarkOverallMetrics();

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Benchmark</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            <Link href="/admin/benchmark/scenarios" className="underline hover:text-foreground">
              Scenario calibration
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Benchmark Subjects" value={metrics.benchmarkSubjects} />
        <StatCard label="Qualifying Attempts" value={metrics.qualifyingAttempts} />
        <StatCard label="First Attempts" value={metrics.firstAttempts} />
        <StatCard label="Repeat Attempts" value={metrics.repeatAttempts} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attempts Today" value={metrics.attemptsToday} />
        <StatCard label="Attempts (7d)" value={metrics.attempts7d} />
        <StatCard label="Attempts (30d)" value={metrics.attempts30d} />
        <StatCard label="Distinct Scenarios Attempted" value={metrics.distinctScenariosAttempted} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Projection Failures" value={metrics.projectionFailures} />
      </div>

      <p className="mt-6 text-xs text-muted">
        Benchmark evidence is derived only from IncidentRank-owned, completed PRACTICE attempts —
        employer assessments and organization-private scenarios are never included. Pseudonymous:
        no engineer identity (display name, email, Clerk ID) is ever shown on this page or stored
        in the underlying fact tables.
      </p>
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
