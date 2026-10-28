import Link from "next/link";
import { notFound } from "next/navigation";
import { count, eq, inArray } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  organizationAuditEvents,
  organizationCreditLedger,
  organizationMembers,
  organizations,
  organizationStripeCustomers,
} from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { getOrganizationCreditBalance } from "@/lib/server/organization-credits";
import { orgCreditPurchaseUsdCentsForQuantity } from "@/lib/server/stripe/revenue-pricing";

const CREDIT_TRANSACTION_LABEL: Record<string, string> = {
  purchase: "Purchase",
  assessment_started: "Candidate started",
  admin_adjustment: "Adjustment",
  refund: "Refund",
  reversal: "Reversal",
  expiration: "Expiration",
};

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Platform admin organization-customer detail (docs/implementation_plan/
 * phase10c.md §30). A thin, billing/support-focused view — distinct from
 * the existing /admin/organizations/[organizationId] governance page
 * (suspend/reactivate/members, Phase 10A). Rather than duplicate
 * suspension controls here, this page links out to the governance page
 * for that; it only adds Stripe customer id + purchase-history-as-gross-
 * USD + audit summary on top of what getOrganizationCreditBalance
 * already provides (spec §39: "customer/revenue views are primarily
 * read-only").
 */
export async function OrganizationCustomerDetailView({ organizationId }: { organizationId: string }) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const organization = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
  if (!organization) notFound();

  const orgAssessments = await db.query.assessments.findMany({
    where: eq(assessments.organizationId, organizationId),
    columns: { id: true },
  });
  const assessmentIds = orgAssessments.map((a) => a.id);

  const [owners, stripeMapping, creditBalance, creditLedgerRows, candidateCountRow, auditEvents] = await Promise.all([
    db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, organizationId),
      with: { user: true },
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    }),
    db.query.organizationStripeCustomers.findFirst({
      where: eq(organizationStripeCustomers.organizationId, organizationId),
    }),
    getOrganizationCreditBalance(organizationId),
    db.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, organizationId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 20,
    }),
    assessmentIds.length > 0
      ? db
          .select({ value: count() })
          .from(assessmentCandidates)
          .where(inArray(assessmentCandidates.assessmentId, assessmentIds))
      : Promise.resolve([{ value: 0 }]),
    db.query.organizationAuditEvents.findMany({
      where: eq(organizationAuditEvents.organizationId, organizationId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 50,
    }),
  ]);

  const purchaseRows = await db.query.organizationCreditLedger.findMany({
    where: eq(organizationCreditLedger.organizationId, organizationId),
  });
  const totalPurchasedUsdCents = purchaseRows
    .filter((r) => r.transactionType === "purchase")
    .reduce((sum, r) => sum + orgCreditPurchaseUsdCentsForQuantity(r.quantity), 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted">{organization.slug}</p>
        </div>
        <Link
          href={`/admin/organizations/${organizationId}`}
          className="rounded-md border border-border px-4 py-2 font-mono text-xs transition-colors hover:border-foreground/40"
        >
          Governance →
        </Link>
      </div>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Status</h2>
      <p className="mt-2 text-sm text-foreground">{organization.status}</p>

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Owners / Admins</h2>
      <ul className="mt-2 flex flex-col gap-1">
        {owners.map((m) => (
          <li key={m.id} className="text-sm text-foreground">
            {m.user.displayName} <span className="font-mono text-xs text-muted">({m.role})</span>
          </li>
        ))}
        {owners.length === 0 && <li className="text-sm text-muted">No members yet.</li>}
      </ul>

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Billing Email</h2>
      <p className="mt-2 font-mono text-xs text-muted">{stripeMapping?.billingEmail ?? "—"}</p>

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Stripe Customer ID</h2>
      <p className="mt-2 font-mono text-xs text-muted">{stripeMapping?.stripeCustomerId ?? "—"}</p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Credits</h2>
      <div className="mt-3 grid grid-cols-3 gap-4">
        <StatCard label="Purchased" value={creditBalance.purchased} />
        <StatCard label="Consumed" value={creditBalance.consumed} />
        <StatCard label="Available" value={creditBalance.available} />
      </div>

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Total Purchased (gross)</h2>
      <p className="mt-2 text-sm text-foreground">{usd(totalPurchasedUsdCents)}</p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Assessment / Candidate Counts</h2>
      <p className="mt-2 text-sm text-foreground">
        {orgAssessments.length} assessments · {candidateCountRow[0]?.value ?? 0} candidate starts
      </p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Credit Ledger (recent)</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {creditLedgerRows.map((row) => (
          <li key={row.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
            <div>
              <p>{CREDIT_TRANSACTION_LABEL[row.transactionType] ?? row.transactionType}</p>
              <p className="mt-1 font-mono text-[10px] text-muted">{row.createdAt.toLocaleString()}</p>
            </div>
            <span className="font-mono text-sm">{row.quantity > 0 ? `+${row.quantity}` : row.quantity}</span>
          </li>
        ))}
        {creditLedgerRows.length === 0 && <li className="text-sm text-muted">No ledger entries.</li>}
      </ul>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Audit History (recent)</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {auditEvents.map((e) => (
          <li key={e.id} className="font-mono text-xs text-muted">
            {e.createdAt.toLocaleString()} · {e.actorType} · {e.action}
          </li>
        ))}
        {auditEvents.length === 0 && <li className="text-sm text-muted">No audit events.</li>}
      </ul>
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
