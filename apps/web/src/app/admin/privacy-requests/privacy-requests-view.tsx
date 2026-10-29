import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { listAllPrivacyRequests } from "@/lib/server/privacy-requests";
import { logAdminAction } from "@/lib/server/admin-audit";
import { db } from "@/lib/server/db";
import { PrivacyRequestStatusControl } from "./privacy-request-status-control";

const TYPE_LABEL: Record<string, string> = {
  access: "Access",
  correction: "Correction",
  deletion: "Deletion",
  other: "Other",
};

/**
 * Phase 10D §44/§52. Admin-only, read-mostly list of privacy requests
 * across all users, with a status-change control. Viewing this list is
 * itself logged (privacy_request_viewed) per §52 — never logging the
 * request's notes content, only identifiers.
 */
export async function PrivacyRequestsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const requests = await listAllPrivacyRequests();

  await logAdminAction(db, {
    adminUserId: user.id,
    action: "privacy_request_viewed",
    targetType: "privacy_request_list",
    metadata: { count: requests.length },
  });

  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy Requests</h1>
        <p className="mt-2 text-sm text-muted">
          Access, correction, deletion, and other privacy requests submitted by users.
        </p>

        {requests.length === 0 ? (
          <p className="mt-10 text-sm text-muted">No privacy requests yet.</p>
        ) : (
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Requested</th>
                  <th className="py-2 pr-4">Completed</th>
                  <th className="py-2 pr-4">Notes</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-b border-border align-top">
                    <td className="py-3 pr-4 font-mono text-xs">{r.userId}</td>
                    <td className="py-3 pr-4">{TYPE_LABEL[r.requestType] ?? r.requestType}</td>
                    <td className="py-3 pr-4 font-mono text-[10px] uppercase tracking-wide">{r.status}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {r.requestedAt.toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted">
                      {r.completedAt ? r.completedAt.toLocaleDateString() : "—"}
                    </td>
                    <td className="py-3 pr-4 max-w-xs truncate text-xs text-muted">{r.notes ?? "—"}</td>
                    <td className="py-3 pr-4">
                      {r.status === "pending" && <PrivacyRequestStatusControl requestId={r.id} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
