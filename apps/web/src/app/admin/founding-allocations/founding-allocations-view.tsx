import { notFound } from "next/navigation";
import { ne } from "drizzle-orm";
import { foundingEngineerAllocations } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { getFoundingCapacity } from "@/lib/server/stripe/founding-allocation";

const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  issued: "Issued",
  released: "Released",
  expired: "Expired",
};

/**
 * Read-only admin view over the 100 Founding Engineer capacity slots
 * (docs/implementation_plan/phase9.md §43). Only non-released rows are
 * listed individually — the remaining open slots are summarized as a
 * count, since 100 "released, no user" rows carry no operational signal
 * row-by-row.
 */
export async function FoundingAllocationsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const [capacity, claimedSlots] = await Promise.all([
    getFoundingCapacity(),
    db.query.foundingEngineerAllocations.findMany({
      where: ne(foundingEngineerAllocations.status, "released"),
      orderBy: (table, { asc }) => [asc(table.slotNumber)],
      with: { user: true },
    }),
  ]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Founding Engineer Allocations</h1>

      <div className="mt-8 grid grid-cols-3 gap-4">
        <StatCard label="Issued" value={capacity.issued} />
        <StatCard label="Reserved" value={capacity.reserved} />
        <StatCard label="Remaining" value={capacity.remaining} />
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Slot</th>
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Reserved</th>
              <th className="py-2 pr-4">Issued</th>
            </tr>
          </thead>
          <tbody>
            {claimedSlots.map((slot) => (
              <tr key={slot.id} className="border-b border-border">
                <td className="py-3 pr-4 font-mono text-xs text-muted">{slot.slotNumber}</td>
                <td className="py-3 pr-4">{slot.user?.displayName ?? "—"}</td>
                <td className="py-3 pr-4">{STATUS_LABEL[slot.status] ?? slot.status}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {slot.reservedAt ? slot.reservedAt.toLocaleString() : "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {slot.issuedAt ? slot.issuedAt.toLocaleString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {claimedSlots.length === 0 && (
          <p className="mt-4 text-sm text-muted">No slots reserved or issued yet.</p>
        )}
      </div>
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
