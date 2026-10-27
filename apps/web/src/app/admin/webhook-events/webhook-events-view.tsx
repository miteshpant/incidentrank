import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  processing: "Processing",
  processed: "Processed",
  failed: "Failed",
};

/**
 * Read-only admin view over the webhook idempotency ledger (docs/
 * implementation_plan/phase9.md §43) — surfaces failed events so a
 * stuck/erroring webhook handler is operationally visible, since Stripe
 * retries happen silently otherwise.
 */
export async function WebhookEventsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const events = await db.query.stripeWebhookEvents.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
    limit: 200,
  });

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Stripe Webhook Events</h1>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Event Type</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Received</th>
              <th className="py-2 pr-4">Processed</th>
              <th className="py-2 pr-4">Error</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id} className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-xs text-muted">{event.eventType}</td>
                <td className="py-3 pr-4">
                  {STATUS_LABEL[event.processingStatus] ?? event.processingStatus}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {event.createdAt.toLocaleString()}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {event.processedAt ? event.processedAt.toLocaleString() : "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-[#dc2626]">
                  {event.error ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="mt-4 text-sm text-muted">No webhook events yet.</p>}
      </div>
    </>
  );
}
