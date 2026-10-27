import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { suspendOrganization } from "@/lib/server/organization-provisioning";

interface SuspendBody {
  reason?: unknown;
}

/**
 * Platform-admin-only: suspend an organization (docs/implementation_plan/
 * phase10a.md §16). Both platform owner and plain admin may suspend, per
 * §2's permission table — this is a support/governance action, not an
 * admin-roster mutation, so it doesn't need requirePlatformOwner.
 */
export async function POST(
  request: Request,
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
  const body = (await request.json().catch(() => null)) as SuspendBody | null;
  const reason = typeof body?.reason === "string" ? body.reason : "";

  const result = await suspendOrganization({
    organizationId,
    reason,
    suspendedByAdminUserId: membership.membership.id,
    actingUserId: user.id,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.reason === "already_suspended") {
      return NextResponse.json({ error: "Organization is already suspended" }, { status: 409 });
    }
    return NextResponse.json({ error: "A suspension reason is required" }, { status: 400 });
  }

  return NextResponse.json({ organization: result.organization });
}
