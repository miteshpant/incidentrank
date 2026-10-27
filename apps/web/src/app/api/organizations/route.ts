import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { organizationMembers } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";

/**
 * Phase 10A §3/§33: ordinary authenticated users can no longer create
 * organizations — this is now an IncidentRank-platform-admin-only
 * operation (see POST /api/admin/organizations and
 * organization-provisioning.ts's createOrganization). This handler is
 * kept (rather than deleted) specifically so a direct API call to the
 * old self-service endpoint fails cleanly, server-side, regardless of
 * what the client sends — never relying on a hidden/removed UI button
 * alone to enforce this.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Organization creation is managed by IncidentRank. Contact support@incidentrank.com to set up a new organization.",
    },
    { status: 403 },
  );
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, user.id),
    with: { organization: true },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({
    organizations: memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    })),
  });
}
