import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { getPlatformSummary, getRevenueSummary, type DateRange } from "@/lib/server/platform-metrics";

const RANGE_LABEL: Record<DateRange, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  all: "All time",
};

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Platform customer & revenue dashboard summary (docs/implementation_
 * plan/phase10c.md §22-26). Any active platform admin may view — no
 * owner-gating (spec §39: "primarily read-only"). Distinct from the
 * existing /admin landing page, which is a general admin-tools index.
 */
export async function DashboardView({ range }: { range: DateRange }) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const [summary, revenue] = await Promise.all([getPlatformSummary(), getRevenueSummary(range)]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer &amp; Revenue Dashboard</h1>
          <p className="mt-1 font-mono text-xs text-muted">
            <Link href="/admin/customers/users" className="underline hover:text-foreground">
              Users
            </Link>{" "}
            ·{" "}
            <Link href="/admin/customers/organizations" className="underline hover:text-foreground">
              Organizations
            </Link>
          </p>
        </div>
      </div>

      <h2 className="mt-10 font-mono text-[10px] uppercase tracking-wide text-muted">Platform</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Total Users" value={summary.totalUsers} />
        <StatCard label="Total Organizations" value={summary.totalOrganizations} />
        <StatCard label="Free Users" value={summary.freeUsers} />
        <StatCard label="Active Pro" value={summary.activePro.total} />
        <StatCard label="Founding Engineers" value={summary.foundingEngineers} />
      </div>
      <p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted">
        {summary.activePro.monthly} monthly · {summary.activePro.annual} annual
      </p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Organizations</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="With Purchases" value={summary.organizationsWithPurchases} />
        <StatCard label="With Available Credits" value={summary.organizationsWithAvailableCredits} />
        <StatCard label="Suspended" value={summary.suspendedOrganizations} />
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Credits</h2>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Purchased" value={summary.creditsTotals.purchased} />
        <StatCard label="Consumed" value={summary.creditsTotals.consumed} />
        <StatCard label="Remaining" value={summary.creditsTotals.available} />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Gross collected — see note
        </h2>
        <div className="flex gap-1 font-mono text-[10px]">
          {(Object.keys(RANGE_LABEL) as DateRange[]).map((r) => (
            <Link
              key={r}
              href={`/admin/dashboard?range=${r}`}
              className={`rounded border px-2 py-1 ${
                r === range ? "border-foreground text-foreground" : "border-border text-muted hover:border-foreground/40"
              }`}
            >
              {RANGE_LABEL[r]}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="MRR (now)" value={usd(revenue.mrrUsdCents)} />
        <StatCard label={`Founding Gross (${RANGE_LABEL[range]})`} value={usd(revenue.foundingGrossUsdCents)} />
        <StatCard label={`Org Credit Gross (${RANGE_LABEL[range]})`} value={usd(revenue.orgCreditGrossUsdCents)} />
        <StatCard label={`Total Gross Collected (${RANGE_LABEL[range]})`} value={usd(revenue.totalGrossCollectedUsdCents)} />
      </div>
      <p className="mt-3 text-xs text-muted">
        MRR is a recurring run-rate computed from currently-active Pro subscriptions — always &quot;right now,&quot;
        never scoped by the date range above. Founding and organization-credit gross are exact one-time totals for
        the selected range. Gross collected figures are not refund-adjusted (automated refund reconciliation remains
        deferred); do not read as net revenue.
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
