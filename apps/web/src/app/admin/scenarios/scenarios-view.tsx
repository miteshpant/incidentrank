import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { db } from "@/lib/server/db";

/**
 * Platform-admin scenario list (Phase 10G §2). Lists every scenario row
 * (built-in and org-owned) with its Phase 10F/10G editorial metadata, so
 * an admin can find a scenario to edit without going through the
 * benchmark/calibration view (which only lists scenarios that already
 * have attempt evidence).
 */
export async function ScenariosView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const rows = await db.query.scenarios.findMany({
    orderBy: (table, { asc }) => [asc(table.slug)],
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Scenarios</h1>
        <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
          {rows.length} total
        </span>
      </div>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="pb-2 pr-4">Slug</th>
              <th className="pb-2 pr-4">Ownership</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Structure</th>
              <th className="pb-2 pr-4">Domain</th>
              <th className="pb-2 pr-4">Free</th>
              <th className="pb-2 pr-4">Release Week</th>
              <th className="pb-2">Published At</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <Link
                    href={`/admin/scenarios/${row.id}`}
                    className="underline hover:text-foreground"
                  >
                    {row.slug}
                  </Link>
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-muted">{row.ownershipType}</td>
                <td className="py-2 pr-4 font-mono text-xs text-muted">{row.status}</td>
                <td className="py-2 pr-4 font-mono text-xs text-muted">{row.structure}</td>
                <td className="py-2 pr-4 font-mono text-xs text-muted">{row.domain ?? "—"}</td>
                <td className="py-2 pr-4 font-mono text-xs text-muted">
                  {row.isFree ? "free" : "paid"}
                  {row.isFreeOverriddenByAdmin ? " (overridden)" : ""}
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-muted">
                  {row.releaseWeek ?? "—"}
                </td>
                <td className="py-2 font-mono text-xs text-muted">
                  {row.publishedAt ? row.publishedAt.toISOString().slice(0, 10) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
