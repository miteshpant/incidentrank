import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canInviteMembers, loadOrganizationMembership } from "@/lib/server/organization-auth";
import { createOrgInvitation, listPendingInvitations } from "@/lib/server/org-membership";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CreateInvitationBody {
  email?: unknown;
  role?: unknown;
}

/** Lists this organization's pending invitations — the Members page's "Pending Invitations" section. */
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

  const invitations = await listPendingInvitations(result.organization.id);
  return NextResponse.json({
    invitations: invitations.map((invite) => ({
      id: invite.id,
      email: invite.email,
      role: invite.role,
      invitedByUserId: invite.invitedByUserId,
      expiresAt: invite.expiresAt,
      createdAt: invite.createdAt,
    })),
  });
}

/**
 * Creates an organization invitation. owner/admin only
 * (canInviteMembers); invitations may only target "admin" or "member" —
 * never "owner" directly, enforced inside createOrgInvitation. Returns
 * the plaintext token exactly once, here, at creation time — never
 * persisted, never retrievable again, mirroring the assessment-candidate
 * invite pattern exactly.
 */
export async function POST(
  request: Request,
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
  if (!canInviteMembers(result.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as CreateInvitationBody | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = typeof body?.role === "string" ? body.role : "";

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 },
    );
  }
  if (role !== "admin" && role !== "member") {
    return NextResponse.json(
      { error: "Role must be admin or member" },
      { status: 400 },
    );
  }

  const outcome = await createOrgInvitation(result.organization.id, user.id, email, role);

  if (!outcome.ok) {
    if (outcome.reason === "already_member") {
      return NextResponse.json(
        { error: "This user is already a member of the organization." },
        { status: 409 },
      );
    }
    if (outcome.reason === "invitation_already_pending") {
      return NextResponse.json(
        { error: "An active invitation already exists for this email." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  return NextResponse.json({
    invitation: {
      id: outcome.invitation.id,
      email: outcome.invitation.email,
      role: outcome.invitation.role,
      expiresAt: outcome.invitation.expiresAt,
    },
    token: outcome.token,
  });
}
