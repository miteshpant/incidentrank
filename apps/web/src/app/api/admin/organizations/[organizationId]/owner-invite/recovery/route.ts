import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { inviteOwnerRecovery } from "@/lib/server/organization-provisioning";
import { appBaseUrl } from "@/lib/server/app-url";

interface RecoveryBody {
  email?: unknown;
  reason?: unknown;
}

/**
 * Platform-admin-only: the owner-recovery override (docs/
 * implementation_plan/phase10a.md §15/§34/§36). Distinct from the
 * resend route above — always creates a NEW invitation flagged
 * isRecoveryInvite, audited under the distinct owner_recovery_invited
 * action, and — unlike every other organization mutation — works even
 * while the organization is suspended, since this is precisely the
 * support path for a suspended-and-effectively-ownerless organization.
 * Requires an explicit human-entered reason, mirroring suspension's own
 * reason requirement.
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
  const body = (await request.json().catch(() => null)) as RecoveryBody | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const reason = typeof body?.reason === "string" ? body.reason : "";

  const result = await inviteOwnerRecovery({
    organizationId,
    email,
    reason,
    invitedByUserId: user.id,
  });

  if (!result.ok) {
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const error =
      result.reason === "invalid_email" ? "A valid email address is required" : "A reason is required";
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({
    invitation: { email: result.invitation.email, expiresAt: result.invitation.expiresAt },
    inviteUrl: `${appBaseUrl()}/organization/invite/${result.token}`,
    emailSent: result.emailSent,
  });
}
