import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import {
  getAnalyticsOverview,
  getAnalyticsFunnel,
  getAnalyticsByScenario,
  getAnalyticsReferrers,
  type AnalyticsRange,
} from "@/lib/server/analytics";

const RANGE_LABEL: Record<AnalyticsRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function pctLabel(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/**
 * Platform-admin-only funnel analytics (docs/implementation_plan/
 * phase10g.metrics.md §6-9). Same gate pattern as every other admin
 * page — isAdminPortalEnabled() -> notFound(), getOrCreateCurrentUser(),
 * loadAdminMembership() -> notFound(). Every number here is a plain
 * aggregate count derived from analytics_events; no candidate reasoning,
 * action values, scores, or scenario-private detail is ever stored in
 * that table (see analyticsEvents' schema comment), so there is nothing
 * sensitive to redact here either.
 */
export async function AnalyticsView({ range }: { range: AnalyticsRange }) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const [overview, funnel, byScenario, referrers] = await Promise.all([
    getAnalyticsOverview(range),
    getAnalyticsFunnel(range),
    getAnalyticsByScenario(range),
    getAnalyticsReferrers(range),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <div className="flex gap-1 font-mono text-[10px]">
          {(Object.keys(RANGE_LABEL) as AnalyticsRange[]).map((r) => (
            <Link
              key={r}
              href={`/admin/analytics?range=${r}`}
              className={`rounded border px-2 py-1 ${
                r === range
                  ? "border-foreground text-foreground"
                  : "border-border text-muted hover:border-foreground/40"
              }`}
            >
              {RANGE_LABEL[r]}
            </Link>
          ))}
        </div>
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Overview</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Page Views" value={overview.pageViews} />
        <StatCard label="Unique Visitors" value={overview.uniqueVisitors} />
        <StatCard label="Incident Views" value={overview.incidentViews} />
        <StatCard label="Incidents Started" value={overview.incidentsStarted} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Incidents Finished" value={overview.incidentsFinished} />
        <StatCard label="Signup Clicks" value={overview.signupClicks} />
        <StatCard label="Registrations" value={overview.registrations} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <StatCard label="View → Start" value={pctLabel(overview.viewToStartPct)} />
        <StatCard label="Start → Finish" value={pctLabel(overview.startToFinishPct)} />
        <StatCard label="View → Registration" value={pctLabel(overview.viewToRegistrationPct)} />
      </div>

      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-wide text-muted">
        Incident Funnel
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Stage</th>
              <th className="py-2 pr-4">Count</th>
              <th className="py-2">Drop-off vs. prior stage</th>
            </tr>
          </thead>
          <tbody>
            {funnel.map((stage, i) => {
              const prior = i > 0 ? funnel[i - 1] : null;
              const dropOffPct = prior ? pct(prior.count - stage.count, prior.count) : null;
              return (
                <tr key={stage.eventName} className="border-b border-border/60">
                  <td className="py-2 pr-4">{stage.name}</td>
                  <td className="py-2 pr-4 font-mono">{stage.count}</td>
                  <td className="py-2 font-mono text-muted">
                    {prior ? pctLabel(dropOffPct) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-wide text-muted">
        By Scenario
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Scenario</th>
              <th className="py-2 pr-4">Views</th>
              <th className="py-2 pr-4">Starts</th>
              <th className="py-2 pr-4">Finishes</th>
              <th className="py-2">Finish Rate</th>
            </tr>
          </thead>
          <tbody>
            {byScenario.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-3 text-sm text-muted">
                  No scenario activity in this range.
                </td>
              </tr>
            ) : (
              byScenario.map((row) => (
                <tr key={row.scenarioSlug} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono">{row.scenarioSlug}</td>
                  <td className="py-2 pr-4 font-mono">{row.views}</td>
                  <td className="py-2 pr-4 font-mono">{row.starts}</td>
                  <td className="py-2 pr-4 font-mono">{row.finishes}</td>
                  <td className="py-2 font-mono text-muted">{pctLabel(row.finishRatePct)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-wide text-muted">
        Referrers
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Referrer</th>
              <th className="py-2">Page Views</th>
            </tr>
          </thead>
          <tbody>
            {referrers.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-3 text-sm text-muted">
                  No page views in this range.
                </td>
              </tr>
            ) : (
              referrers.map((row) => (
                <tr key={row.referrer} className="border-b border-border/60">
                  <td className="py-2 pr-4 font-mono">{row.referrer}</td>
                  <td className="py-2 font-mono">{row.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-xs text-muted">
        First-party, best-effort analytics only — no third-party trackers, no session replay, no
        candidate reasoning/action/score data is ever recorded in these events.
      </p>
    </>
  );
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
