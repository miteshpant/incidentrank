import { NextResponse } from "next/server";
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

/**
 * Single-organization admin detail view (docs/implementation_plan/
 * phase10a.md §54). Platform admins may inspect any organization's data
 * for support/governance regardless of its status — including suspended
 * — per §60's "platform admin inspection must continue to work."
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  if (!isAdminPortalEnabled()) {
    return NextResponse.json({ error: "Admin portal is not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await loadAdminMembership(user);
  if (!membership.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { organizationId } = await params;
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  return NextResponse.json({
    organization,
    members,
    scenarioCount: scenarioCount[0]?.value ?? 0,
    assessmentCount: assessmentCount[0]?.value ?? 0,
    candidateCount: candidateCount[0]?.value ?? 0,
    auditEvents,
  });
}
