import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { organizationCreditLedger } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { SiteHeader } from "@/components/site-header";
import { SuspendedOrgBanner } from "@/components/suspended-org-banner";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate, loadOrganizationMembership } from "@/lib/server/organization-auth";
import {
  isLaunchDiscountsEnabled,
  isOrgBillingEnabled,
  isOrgCreditPurchaseEnabled,
} from "@/lib/server/feature-flags";
import { getOrganizationCreditBalance } from "@/lib/server/organization-credits";
import { OrgCheckoutButton } from "./org-checkout-button";

export const instant = false;

const TRANSACTION_LABEL: Record<string, string> = {
  purchase: "Purchase",
  assessment_started: "Candidate started assessment",
  admin_adjustment: "Adjustment",
  refund: "Refund",
  reversal: "Reversal",
  expiration: "Expiration",
};

/**
 * Organization billing page (docs/implementation_plan/phase10b.md §35/
 * §36). Owner/admin only — a member sees a plain denial (§34's "owner/
 * admin only" boundary; no billing internals leak to anyone else).
 * Shows Assessment Credits terminology exclusively (§73) — never
 * "tokens"/"coins"/"points".
 */
export default async function OrganizationBillingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <BillingContent slug={slug} />
        </Suspense>
      </section>
    </main>
  );
}

async function BillingContent({ slug }: { slug: string }) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) notFound();

  if (!canMutate(result.membership.role)) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-4 text-sm text-muted">
          Only organization owners and admins can view billing.
        </p>
      </div>
    );
  }

  const billingEnabled = isOrgBillingEnabled();
  const purchaseEnabled = isOrgCreditPurchaseEnabled();
  const organization = result.organization;

  const balance = billingEnabled
    ? await getOrganizationCreditBalance(organization.id)
    : { purchased: 0, consumed: 0, adjusted: 0, available: 0 };

  const ledgerRows = billingEnabled
    ? await db.query.organizationCreditLedger.findMany({
        where: eq(organizationCreditLedger.organizationId, organization.id),
        orderBy: (table, { desc }) => [desc(table.createdAt)],
        limit: 50,
      })
    : [];

  // docs/implementation_plan/phase10e.md §6/§42: only an organization
  // that has never completed a successful purchase is eligible for the
  // first-purchase launch offer — reusing the same ledger rows already
  // fetched above, never a second query. Never implies the discount
  // applies to a second purchase.
  const hasEverPurchased = ledgerRows.some((row) => row.transactionType === "purchase");
  const showOrgLaunchOffer = isLaunchDiscountsEnabled() && !hasEverPurchased;

  const assessmentIds = Array.from(
    new Set(ledgerRows.map((row) => row.assessmentId).filter((id): id is string => Boolean(id))),
  );
  const creatorIds = Array.from(
    new Set(
      ledgerRows.map((row) => row.createdByUserId).filter((id): id is string => Boolean(id)),
    ),
  );

  const [assessmentRows, creatorRows] = await Promise.all([
    assessmentIds.length > 0
      ? db.query.assessments.findMany({
          where: (table, { inArray }) => inArray(table.id, assessmentIds),
          columns: { id: true, name: true },
        })
      : Promise.resolve([] as { id: string; name: string }[]),
    creatorIds.length > 0
      ? db.query.users.findMany({
          where: (table, { inArray }) => inArray(table.id, creatorIds),
          columns: { id: true, displayName: true },
        })
      : Promise.resolve([] as { id: string; displayName: string }[]),
  ]);
  const assessmentNameById = new Map(assessmentRows.map((a) => [a.id, a.name]));
  const creatorNameById = new Map(creatorRows.map((u) => [u.id, u.displayName]));

  return (
    <>
      {organization.status === "suspended" && <SuspendedOrgBanner />}

      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
      <p className="mt-1 font-mono text-xs text-muted">{organization.name}</p>

      {!billingEnabled ? (
        <p className="mt-6 text-sm text-muted">Organization billing is not currently enabled.</p>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-4 gap-4">
            <StatCard label="Available" value={balance.available} highlight />
            <StatCard label="Purchased" value={balance.purchased} />
            <StatCard label="Used" value={balance.consumed} />
            <StatCard label="Adjusted" value={balance.adjusted} />
          </div>

          {balance.available === 0 && (
            <p className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              No assessment credits available. Purchase credits to allow new candidate starts.
            </p>
          )}

          <div className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
              Assessment Credits
            </h2>
            {!purchaseEnabled ? (
              <p className="mt-4 text-sm text-muted">
                Credit purchasing is not currently enabled for this organization.
              </p>
            ) : organization.status !== "active" ? (
              <p className="mt-4 text-sm text-muted">
                This organization must be active to purchase credits.
              </p>
            ) : (
              <>
                {showOrgLaunchOffer && (
                  <p className="mt-4 rounded border border-border bg-surface px-3 py-2 font-mono text-[11px] text-muted">
                    <span className="text-foreground">Launch offer:</span> 50% off your
                    organization&apos;s first assessment-credit purchase only. Normal pricing
                    applies after that.
                  </p>
                )}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div className="rounded-md border border-border bg-surface p-4">
                    <p className="text-sm font-medium">1 Assessment Credit</p>
                    <p className="mt-1 font-mono text-xs text-muted">$50</p>
                    <div className="mt-3">
                      <OrgCheckoutButton slug={slug} plan="single_credit" label="Buy 1 Credit" />
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-surface p-4">
                    <p className="text-sm font-medium">110 Assessment Credits</p>
                    <p className="mt-1 font-mono text-xs text-muted">$5,000</p>
                    <div className="mt-3">
                      <OrgCheckoutButton slug={slug} plan="credit_pack_110" label="Buy 110 Credits" />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="mt-10">
            <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
              Billing History
            </h2>
            {ledgerRows.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No billing activity yet.</p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {ledgerRows.map((row) => {
                  const assessmentName = row.assessmentId
                    ? assessmentNameById.get(row.assessmentId)
                    : null;
                  const creatorName = row.createdByUserId
                    ? creatorNameById.get(row.createdByUserId)
                    : null;
                  return (
                    <li
                      key={row.id}
                      className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm"
                    >
                      <div>
                        <p>{TRANSACTION_LABEL[row.transactionType] ?? row.transactionType}</p>
                        <p className="mt-1 font-mono text-[10px] text-muted">
                          {new Date(row.createdAt).toLocaleString()}
                          {assessmentName ? ` · ${assessmentName}` : ""}
                          {creatorName ? ` · ${creatorName}` : ""}
                          {row.reason ? ` · ${row.reason}` : ""}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-medium">
                        {row.quantity > 0 ? `+${row.quantity}` : row.quantity}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="mt-10">
        <Link
          href={`/organizations/${slug}`}
          className="font-mono text-xs text-muted hover:text-foreground"
        >
          ← Back to dashboard
        </Link>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${highlight ? "" : "text-muted"}`}>
        {value}
      </p>
    </div>
  );
}
