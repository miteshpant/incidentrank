import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getVerifiedPrimaryEmail } from "@/lib/server/verified-email";
import { acceptAdminInvite, loadAdminInviteByToken } from "@/lib/server/admin-invites";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isAdminPortalEnabled()) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const { token } = await params;
  const result = await loadAdminInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  return NextResponse.json({
    email: result.invite.email,
    role: result.invite.role,
    alreadyAccepted: result.invite.acceptedByUserId !== null,
    expired: result.invite.status !== "revoked" && result.invite.expiresAt < new Date(),
    revoked: result.invite.status === "revoked",
  });
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!isAdminPortalEnabled()) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { token } = await params;
  const result = await loadAdminInviteByToken(token);
  if (!result.ok) {
    return NextResponse.json({ error: "Invalid invitation" }, { status: 404 });
  }

  const verifiedEmail = await getVerifiedPrimaryEmail();
  const accepted = await acceptAdminInvite(result.invite, user, verifiedEmail);

  if (!accepted.ok) {
    const status =
      accepted.reason === "revoked" || accepted.reason === "expired" ? 410 : 403;
    return NextResponse.json({ error: accepted.reason }, { status });
  }

  return NextResponse.json({ membership: accepted.membership });
}
