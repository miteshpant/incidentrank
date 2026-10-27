import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { NewPromoInviteForm } from "./new-promo-invite-form";

const STATUS_LABEL: Record<string, string> = {
  created: "Created",
  sent: "Sent",
  redeemed: "Redeemed",
  expired: "Expired",
  revoked: "Revoked",
  send_failed: "Send Failed",
};

/**
 * Admin promotional-invite dashboard (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §23, with the lineage
 * view corrections doc Step 15 asks for: Promo Invite -> Incident Pass
 * -> Scenario -> Attempt -> Pass consumed, shown per row via the
 * joined incidentPass/scenario/attempts relations).
 */
export async function PromoInvitesView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const invites = await db.query.promotionalInvites.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: {
      redeemedBy: true,
      incidentPass: {
        with: {
          scenario: true,
          attempts: true,
        },
      },
    },
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Promotional Invites</h1>

      <div className="mt-6">
        <NewPromoInviteForm />
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Campaign</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Redeemed By</th>
              <th className="py-2 pr-4">Scenario</th>
              <th className="py-2 pr-4">Attempt</th>
              <th className="py-2 pr-4">Pass</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => {
              const pass = invite.incidentPass;
              const attempt = pass?.attempts?.[0];
              return (
                <tr key={invite.id} className="border-b border-border">
                  <td className="py-3 pr-4">{invite.email}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">
                    {invite.campaign ?? "—"}
                  </td>
                  <td className="py-3 pr-4">{STATUS_LABEL[invite.status] ?? invite.status}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">
                    {invite.redeemedBy?.displayName ?? "—"}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">
                    {pass?.scenario?.name ?? "—"}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">
                    {attempt ? (attempt.status === "completed" ? "Completed" : "Started") : "—"}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted">
                    {pass?.status ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {invites.length === 0 && (
          <p className="mt-4 text-sm text-muted">No promotional invites yet.</p>
        )}
      </div>
    </>
  );
}
