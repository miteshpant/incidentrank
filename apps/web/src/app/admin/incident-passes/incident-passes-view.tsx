import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

const STATUS_LABEL: Record<string, string> = {
  available: "Available",
  bound: "Bound",
  consumed: "Consumed",
  expired: "Expired",
  revoked: "Revoked",
};

const SOURCE_LABEL: Record<string, string> = {
  promo_invite: "Promo Invite",
  referral_reward: "Referral Reward",
  admin_grant: "Admin Grant",
};

export async function IncidentPassesView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const passes = await db.query.incidentPasses.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: { user: true, scenario: true },
    limit: 200,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Incident Passes</h1>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Source</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Scenario</th>
              <th className="py-2 pr-4">Granted</th>
            </tr>
          </thead>
          <tbody>
            {passes.map((pass) => (
              <tr key={pass.id} className="border-b border-border">
                <td className="py-3 pr-4">{pass.user.displayName}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {SOURCE_LABEL[pass.sourceType] ?? pass.sourceType}
                </td>
                <td className="py-3 pr-4">{STATUS_LABEL[pass.status] ?? pass.status}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {pass.scenario?.name ?? "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {pass.grantedAt.toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {passes.length === 0 && <p className="mt-4 text-sm text-muted">No Incident Passes yet.</p>}
      </div>
    </>
  );
}
