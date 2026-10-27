import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { reactivateOrganization } from "@/lib/server/organization-provisioning";

/** Platform-admin-only: reactivate a suspended organization (docs/implementation_plan/phase10a.md §20). */
export async function POST(
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

  const result = await reactivateOrganization({
    organizationId,
    reactivatedByAdminUserId: membership.membership.id,
    actingUserId: user.id,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Organization is not currently suspended" }, { status: 409 });
  }

  return NextResponse.json({ organization: result.organization });
}
