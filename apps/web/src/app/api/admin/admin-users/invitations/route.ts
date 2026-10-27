import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { createAdminInvite } from "@/lib/server/admin-invites";
import { logAdminAction } from "@/lib/server/admin-audit";
import { db } from "@/lib/server/db";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

interface InviteAdminBody {
  email?: unknown;
  role?: unknown;
}

/**
 * Admin-only: invite a future admin/owner. Domain validation happens in
 * createAdminInvite itself (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.4).
 */
export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as InviteAdminBody | null;
  if (typeof body?.email !== "string" || (body.role !== "owner" && body.role !== "admin")) {
    return NextResponse.json({ error: "email and role are required" }, { status: 400 });
  }

  const result = await createAdminInvite({
    email: body.email,
    role: body.role,
    invitedByUserId: user.id,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Admin invitations require an @incidentrank.com email" },
      { status: 400 },
    );
  }

  await logAdminAction(db, {
    adminUserId: user.id,
    action: "admin_invited",
    targetType: "admin_invite",
    targetId: result.invite.id,
    metadata: { email: result.invite.email, role: result.invite.role },
  });

  return NextResponse.json({ token: result.token });
}
