import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { resendOwnerInvite } from "@/lib/server/organization-provisioning";
import { appBaseUrl } from "@/lib/server/app-url";

/**
 * Platform-admin-only: resend the organization's current pending owner
 * invitation (docs/implementation_plan/phase10a.md §10/§54). Does not
 * create a second invitation — refreshes the existing row's token/expiry
 * and re-sends the same email.
 */
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

  const result = await resendOwnerInvite({
    organizationId,
    actingUserId: user.id,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "No pending owner invitation exists for this organization" },
      { status: 409 },
    );
  }

  return NextResponse.json({
    invitation: { email: result.invitation.email, expiresAt: result.invitation.expiresAt },
    inviteUrl: `${appBaseUrl()}/organization/invite/${result.token}`,
    emailSent: result.emailSent,
  });
}
