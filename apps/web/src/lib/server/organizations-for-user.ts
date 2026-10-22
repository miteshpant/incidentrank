import "server-only";
import { eq } from "drizzle-orm";
import { organizationMembers, type Organization } from "@incidentrank/db";
import type { OrganizationRole } from "./organization-auth";
import { db } from "./db";

export interface OrganizationMembership {
  organization: Organization;
  role: OrganizationRole;
}

export async function listOrganizationsForUser(
  userId: string,
): Promise<OrganizationMembership[]> {
  const rows = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, userId),
    with: { organization: true },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return rows.map((row) => ({ organization: row.organization, role: row.role }));
}
