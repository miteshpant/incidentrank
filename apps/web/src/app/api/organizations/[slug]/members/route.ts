import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership } from "@/lib/server/organization-auth";
import { listOrgMembers } from "@/lib/server/org-membership";

/**
 * Lists an organization's members (not invitations — see
 * .../members/invitations for those). Authorization is membership-based:
 * any member (owner/admin/member) may view the roster, matching the
 * spec's "member → view organization" permission.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }

  const members = await listOrgMembers(result.organization.id);
  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt,
      user: { id: m.user.id, displayName: m.user.displayName },
    })),
  });
}
