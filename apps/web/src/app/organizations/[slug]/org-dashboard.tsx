import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { assessments as assessmentsTable, organizationMembers } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership } from "@/lib/server/organization-auth";
import { SuspendedOrgBanner } from "@/components/suspended-org-banner";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
};

interface OrgDashboardProps {
  slug: string;
}

export async function OrgDashboard({ slug }: OrgDashboardProps) {
  const user = await getOrCreateCurrentUser();
  if (!user) return null; // middleware protects this route; unreachable in practice.

  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) notFound();

  const [assessmentRows, memberCount] = await Promise.all([
    db.query.assessments.findMany({
      where: eq(assessmentsTable.organizationId, result.organization.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      with: { candidates: true },
    }),
    db.query.organizationMembers
      .findMany({
        where: eq(organizationMembers.organizationId, result.organization.id),
      })
      .then((rows) => rows.length),
  ]);

  return (
    <>
      {result.organization.status === "suspended" && <SuspendedOrgBanner />}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {result.organization.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-muted">
            {memberCount} member{memberCount === 1 ? "" : "s"} · your role:{" "}
            {result.membership.role}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/organizations/${slug}/members`}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
          >
            Members
          </Link>
          <Link
            href={`/organizations/${slug}/scenarios`}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
          >
            Scenarios
          </Link>
          {(result.membership.role === "owner" || result.membership.role === "admin") && (
            <Link
              href={`/organizations/${slug}/billing`}
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Billing
            </Link>
          )}
          <Link
            href={`/organizations/${slug}/assessments/new`}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Create Assessment
          </Link>
        </div>
      </div>

      <div className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
          Assessments
        </h2>
        {assessmentRows.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No assessments yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {assessmentRows.map((assessment) => {
              const completedCount = assessment.candidates.filter(
                (c) => c.status === "completed",
              ).length;
              return (
                <li key={assessment.id}>
                  <Link
                    href={`/organizations/${slug}/assessments/${assessment.id}`}
                    className="flex items-center justify-between rounded-md border border-border bg-surface p-4 transition-colors hover:border-foreground/40"
                  >
                    <div>
                      <span className="text-sm font-medium">{assessment.name}</span>
                      <p className="mt-1 font-mono text-xs text-muted">
                        {assessment.candidates.length} candidate
                        {assessment.candidates.length === 1 ? "" : "s"} ·{" "}
                        {completedCount} completed
                      </p>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wide text-muted">
                      {STATUS_LABEL[assessment.status] ?? assessment.status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
