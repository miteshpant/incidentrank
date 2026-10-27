import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import {
  assessments,
  organizationMembers,
  scenarios,
} from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { notFound } from "next/navigation";

/**
 * Platform-admin organization list (docs/implementation_plan/phase10a.md
 * §4/§53). Mirrors api/admin/organizations GET's aggregation inline,
 * since this is a server component (not a client fetch of that route) —
 * matching the existing admin-users/admin-dashboard convention of each
 * view independently querying the DB rather than calling its own API.
 */
export async function OrganizationsView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const orgs = await db.query.organizations.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const rows = await Promise.all(
    orgs.map(async (org) => {
      const [owners, scenarioCount, assessmentCount] = await Promise.all([
        db.query.organizationMembers.findMany({
          where: and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.role, "owner")),
          with: { user: true },
        }),
        db.select({ value: count() }).from(scenarios).where(eq(scenarios.organizationId, org.id)),
        db.select({ value: count() }).from(assessments).where(eq(assessments.organizationId, org.id)),
      ]);

      return {
        ...org,
        ownerDisplayNames: owners.map((o) => o.user?.displayName).filter(Boolean) as string[],
        scenarioCount: scenarioCount[0]?.value ?? 0,
        assessmentCount: assessmentCount[0]?.value ?? 0,
      };
    }),
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <Link
          href="/admin/organizations/new"
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          New Organization
        </Link>
      </div>

      {rows.length === 0 && (
        <p className="mt-10 text-sm text-muted">No organizations yet.</p>
      )}

      <ul className="mt-10 flex flex-col gap-2">
        {rows.map((org) => (
          <li key={org.id}>
            <Link
              href={`/admin/organizations/${org.id}`}
              className="flex items-center justify-between rounded-md border border-border bg-surface p-4 transition-colors hover:border-foreground/40"
            >
              <div>
                <p className="text-sm font-medium">{org.name}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
                  {org.slug} ·{" "}
                  {org.ownerDisplayNames.length > 0
                    ? org.ownerDisplayNames.join(", ")
                    : "no owner yet"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[10px] text-muted">
                  {org.scenarioCount} scenarios · {org.assessmentCount} assessments
                </span>
                <StatusBadge status={org.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "suspended"
      ? "text-[#dc2626]"
      : status === "pending"
        ? "text-amber-500"
        : "text-muted";
  return (
    <span className={`font-mono text-[10px] uppercase tracking-wide ${color}`}>
      {status}
    </span>
  );
}
