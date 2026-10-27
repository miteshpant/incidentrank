import { notFound } from "next/navigation";
import { count, eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  organizationAuditEvents,
  organizationMembers,
  organizations,
  scenarios,
} from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { OrganizationActions } from "./organization-actions";

/**
 * Single-organization admin detail view (docs/implementation_plan/
 * phase10a.md §54). Platform admins may inspect any organization's data
 * for support/governance regardless of its status — including suspended
 * — per §60.
 */
export async function OrganizationDetailView({ organizationId }: { organizationId: string }) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) notFound();

  const [members, scenarioCount, assessmentCount, candidateCount, auditEvents] = await Promise.all([
    db.query.organizationMembers.findMany({
      where: eq(organizationMembers.organizationId, organizationId),
      with: { user: true },
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    }),
    db.select({ value: count() }).from(scenarios).where(eq(scenarios.organizationId, organizationId)),
    db.select({ value: count() }).from(assessments).where(eq(assessments.organizationId, organizationId)),
    db
      .select({ value: count() })
      .from(assessmentCandidates)
      .innerJoin(assessments, eq(assessmentCandidates.assessmentId, assessments.id))
      .where(eq(assessments.organizationId, organizationId)),
    db.query.organizationAuditEvents.findMany({
      where: eq(organizationAuditEvents.organizationId, organizationId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 50,
    }),
  ]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{organization.name}</h1>
          <p className="mt-1 font-mono text-xs text-muted">{organization.slug}</p>
        </div>
        <StatusBadge status={organization.status} />
      </div>

      {organization.status === "suspended" && organization.suspensionReason && (
        <p className="mt-4 rounded-md border border-[#dc2626]/40 bg-[#dc2626]/5 p-3 text-sm">
          Suspended: {organization.suspensionReason}
        </p>
      )}

      <div className="mt-6 grid grid-cols-3 gap-4">
        <StatCard label="Scenarios" value={scenarioCount[0]?.value ?? 0} />
        <StatCard label="Assessments" value={assessmentCount[0]?.value ?? 0} />
        <StatCard label="Candidates" value={candidateCount[0]?.value ?? 0} />
      </div>

      <div className="mt-8">
        <OrganizationActions organizationId={organization.id} status={organization.status} />
      </div>

      <div className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Members</h2>
        <ul className="mt-4 flex flex-col gap-2">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm"
            >
              <span>{m.user.displayName}</span>
              <span className="font-mono text-xs text-muted">{m.role}</span>
            </li>
          ))}
          {members.length === 0 && (
            <p className="text-sm text-muted">No members yet — owner invitation still pending.</p>
          )}
        </ul>
      </div>

      <div className="mt-10">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Audit Log</h2>
        <ul className="mt-4 flex flex-col gap-1">
          {auditEvents.map((event) => (
            <li key={event.id} className="font-mono text-xs text-muted">
              {new Date(event.createdAt).toISOString()} · {event.actorType} · {event.action}
            </li>
          ))}
          {auditEvents.length === 0 && <p className="text-sm text-muted">No audit events yet.</p>}
        </ul>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
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
    <span className={`font-mono text-xs uppercase tracking-wide ${color}`}>{status}</span>
  );
}
