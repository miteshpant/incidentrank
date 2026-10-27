import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

const STATUS_LABEL: Record<string, string> = {
  created: "Created",
  claimed: "Claimed",
  qualified: "Qualified",
  rewarded: "Rewarded",
  rejected: "Rejected",
  expired: "Expired",
  revoked: "Revoked",
};

/**
 * Admin referral lineage view (corrections doc Step 15): Referral ->
 * Referred Pass -> Qualifying Attempt -> Qualified -> Reward Pass, per
 * row. Never exposes the referred user's score/tier/reasoning — only
 * coarse state, matching the same privacy rule the referrer-facing UI
 * enforces (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §27).
 */
export async function ReferralsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const referralRows = await db.query.referrals.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    with: {
      referrer: true,
      referred: true,
      qualifyingAttempt: true,
    },
    limit: 200,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Referrals</h1>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Referrer</th>
              <th className="py-2 pr-4">Referred</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Qualifying Attempt</th>
              <th className="py-2 pr-4">Reward Issued</th>
            </tr>
          </thead>
          <tbody>
            {referralRows.map((referral) => (
              <tr key={referral.id} className="border-b border-border">
                <td className="py-3 pr-4">{referral.referrer.displayName}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {referral.referred?.displayName ?? "—"}
                </td>
                <td className="py-3 pr-4">{STATUS_LABEL[referral.status] ?? referral.status}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {referral.qualifyingAttempt ? "Resolved" : "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {referral.rewardIncidentPassId ? "Yes" : "No"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {referralRows.length === 0 && (
          <p className="mt-4 text-sm text-muted">No referrals yet.</p>
        )}
      </div>
    </>
  );
}
