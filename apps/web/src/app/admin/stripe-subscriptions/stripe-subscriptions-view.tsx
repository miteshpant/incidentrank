import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

/**
 * Read-only admin mirror of stripeSubscriptions — the raw Stripe-status
 * table (docs/implementation_plan/phase9.md §43), distinct from the
 * policy-derived paidEntitlements view. Shows Stripe's own status string
 * directly, never relabeled, since this view exists for operational
 * debugging against what Stripe itself reports.
 */
export async function StripeSubscriptionsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const subscriptions = await db.query.stripeSubscriptions.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: { user: true },
    limit: 200,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Stripe Subscriptions</h1>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Stripe Status</th>
              <th className="py-2 pr-4">Cancel at Period End</th>
              <th className="py-2 pr-4">Period End</th>
              <th className="py-2 pr-4">Subscription ID</th>
            </tr>
          </thead>
          <tbody>
            {subscriptions.map((sub) => (
              <tr key={sub.id} className="border-b border-border">
                <td className="py-3 pr-4">{sub.user.displayName}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">{sub.stripeStatus}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {sub.cancelAtPeriodEnd ? "Yes" : "No"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {sub.currentPeriodEnd ? sub.currentPeriodEnd.toLocaleDateString() : "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {sub.stripeSubscriptionId}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {subscriptions.length === 0 && (
          <p className="mt-4 text-sm text-muted">No Stripe subscriptions yet.</p>
        )}
      </div>
    </>
  );
}
