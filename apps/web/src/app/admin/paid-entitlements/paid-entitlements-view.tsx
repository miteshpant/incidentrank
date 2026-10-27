import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

const TYPE_LABEL: Record<string, string> = {
  pro: "Pro",
  founding_lifetime: "Founding Engineer",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  canceled: "Canceled",
  past_due: "Past Due",
  revoked: "Revoked",
};

/**
 * Read-only admin view over paidEntitlements (docs/implementation_plan/
 * phase9.md §43) — no Stripe-mutating actions here, matching the
 * existing incident-passes admin view's read-only precedent.
 */
export async function PaidEntitlementsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const entitlements = await db.query.paidEntitlements.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: { user: true },
    limit: 200,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Paid Entitlements</h1>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">Starts</th>
              <th className="py-2 pr-4">Period End</th>
            </tr>
          </thead>
          <tbody>
            {entitlements.map((entitlement) => (
              <tr key={entitlement.id} className="border-b border-border">
                <td className="py-3 pr-4">{entitlement.user.displayName}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {TYPE_LABEL[entitlement.entitlementType] ?? entitlement.entitlementType}
                </td>
                <td className="py-3 pr-4">{STATUS_LABEL[entitlement.status] ?? entitlement.status}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">{entitlement.source}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {entitlement.startsAt.toLocaleDateString()}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {entitlement.currentPeriodEnd
                    ? entitlement.currentPeriodEnd.toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entitlements.length === 0 && (
          <p className="mt-4 text-sm text-muted">No paid entitlements yet.</p>
        )}
      </div>
    </>
  );
}
