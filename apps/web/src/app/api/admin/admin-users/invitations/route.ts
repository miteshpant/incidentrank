import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership, requirePlatformOwner } from "@/lib/server/admin-auth";
import { createAdminInvite } from "@/lib/server/admin-invites";
import { logAdminAction } from "@/lib/server/admin-audit";
import { db } from "@/lib/server/db";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

interface InviteAdminBody {
  email?: unknown;
  role?: unknown;
}

/**
 * Platform-owner-only: invite a future admin. Domain validation happens in
 * createAdminInvite itself (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.4).
 *
 * Phase 10A §1/§48: only the platform owner may invite another platform
 * admin — a plain admin must never be able to self-escalate the roster.
 * requirePlatformOwner replaces the generic loadAdminMembership ok-check
 * that previously gated this route (any active admin, owner or not,
 * could invite another plain admin — see phase10a.md's confirmed gap).
 * A second owner-role invite is also rejected outright here (clean 400)
 * rather than relying on admin_users_single_owner_idx to reject it only
 * at accept time — owner transfer is explicitly out of scope (§49).
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
  const ownerCheck = requirePlatformOwner(membership);
  if (!ownerCheck.ok) {
    return NextResponse.json(
      { error: "Only the platform owner may invite platform admins" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as InviteAdminBody | null;
  if (typeof body?.email !== "string" || body.role !== "admin") {
    return NextResponse.json(
      { error: "email is required; role must be \"admin\" — a second owner may never be invited" },
      { status: 400 },
    );
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
    // Phase 10D data-minimization: the invited email is already stored
    // on the admin_invite row itself (targetId) — no need to duplicate it.
    metadata: { role: result.invite.role },
  });

  return NextResponse.json({ token: result.token });
}
