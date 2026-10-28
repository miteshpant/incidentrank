import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import {
  incidentPasses,
  paidEntitlements,
  referrals,
  stripeCustomers,
  stripeSubscriptions,
  users,
} from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { resolveEmailsForUsers } from "@/lib/server/customer-identity";
import { getLatestRankSnapshotForUser } from "@/lib/server/engineer-rank";
import {
  FOUNDING_LIFETIME_PRICE_USD_CENTS,
  proAnnualMrrUsdCents,
  proMonthlyMrrUsdCents,
} from "@/lib/server/stripe/revenue-pricing";
import { getPlanPriceId } from "@/lib/server/stripe/config";

const BAND_LABEL: Record<string, string> = {
  developing: "Developing",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Platform admin user-customer detail (docs/implementation_plan/
 * phase10c.md §28). Billing/support-focused — Engineer Rank, if shown
 * at all, is visually separate ("support reference only"), band +
 * confidence only, never mixed into the billing tables (spec §28's
 * explicit "do not turn this into a performance admin page").
 */
export async function UserDetailView({ userId }: { userId: string }) {
  if (!isAdminPortalEnabled()) notFound();

  const adminUser = await getOrCreateCurrentUser();
  if (!adminUser) return null;

  const membership = await loadAdminMembership(adminUser);
  if (!membership.ok) notFound();

  const targetUser = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!targetUser) notFound();

  const [entitlements, subscriptions, stripeCustomer, passCounts, referralCounts, rankSnapshot, emails] =
    await Promise.all([
      db.query.paidEntitlements.findMany({ where: eq(paidEntitlements.userId, userId) }),
      db.query.stripeSubscriptions.findMany({ where: eq(stripeSubscriptions.userId, userId) }),
      db.query.stripeCustomers.findFirst({ where: eq(stripeCustomers.userId, userId) }),
      db.select({ value: count() }).from(incidentPasses).where(eq(incidentPasses.userId, userId)),
      db.select({ value: count() }).from(referrals).where(eq(referrals.referrerUserId, userId)),
      getLatestRankSnapshotForUser(userId),
      resolveEmailsForUsers([targetUser.authProviderId]),
    ]);

  const activeFounding = entitlements.find((e) => e.entitlementType === "founding_lifetime" && e.status === "active");
  const activePro = entitlements.find((e) => e.entitlementType === "pro" && e.status === "active");
  const activeSubscription = subscriptions.find((s) => s.stripeStatus === "active");
  const monthlyPriceId = getPlanPriceId("pro_monthly");

  const totalPurchasedUsdCents =
    (activeFounding ? FOUNDING_LIFETIME_PRICE_USD_CENTS : 0) +
    (activePro
      ? activeSubscription?.stripePriceId === monthlyPriceId
        ? proMonthlyMrrUsdCents()
        : proAnnualMrrUsdCents()
      : 0);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{targetUser.displayName}</h1>
      <p className="mt-1 font-mono text-xs text-muted">
        {emails.get(targetUser.authProviderId) ?? "—"} · created {targetUser.createdAt.toLocaleDateString()}
      </p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Current Entitlement</h2>
      <p className="mt-2 text-sm text-foreground">
        {activeFounding ? "Founding Engineer (lifetime)" : activePro ? "Pro" : "Free"}
      </p>

      {activeSubscription && (
        <>
          <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Pro Subscription</h2>
          <p className="mt-2 text-sm text-foreground">
            {activeSubscription.stripePriceId === monthlyPriceId ? "Monthly" : "Annual"} ·{" "}
            {activeSubscription.stripeStatus}
            {activeSubscription.cancelAtPeriodEnd && " · cancels at period end"}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            period end: {activeSubscription.currentPeriodEnd?.toLocaleDateString() ?? "—"}
          </p>
        </>
      )}

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Total Purchased</h2>
      <p className="mt-2 text-sm text-foreground">{usd(totalPurchasedUsdCents)}</p>

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Stripe Customer</h2>
      <p className="mt-2 font-mono text-xs text-muted">{stripeCustomer?.stripeCustomerId ?? "—"}</p>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Payment / Purchase History</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {entitlements.length === 0 && <li className="text-sm text-muted">No purchases.</li>}
        {entitlements.map((e) => (
          <li key={e.id} className="rounded-md border border-border p-3 text-sm">
            <p>
              {e.entitlementType === "founding_lifetime" ? "Founding Engineer" : "Pro"} — {e.status}
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted">
              {e.createdAt.toLocaleDateString()} · price {e.stripePriceId ?? "—"}
            </p>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">Incident Pass Summary</h2>
      <p className="mt-2 text-sm text-foreground">{passCounts[0]?.value ?? 0} total passes</p>

      <h2 className="mt-6 font-mono text-[10px] uppercase tracking-wide text-muted">Referral Summary</h2>
      <p className="mt-2 text-sm text-foreground">{referralCounts[0]?.value ?? 0} referrals sent</p>

      {rankSnapshot && (
        <>
          <h2 className="mt-8 font-mono text-[10px] uppercase tracking-wide text-muted">
            Engineer Rank (support reference only)
          </h2>
          <p className="mt-2 text-sm text-muted">
            {BAND_LABEL[rankSnapshot.rankBand] ?? rankSnapshot.rankBand} · {rankSnapshot.confidence} confidence
            {rankSnapshot.provisional && " · provisional"}
          </p>
        </>
      )}
    </>
  );
}
