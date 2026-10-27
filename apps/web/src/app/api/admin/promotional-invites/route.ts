import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isPromotionalInvitesEnabled } from "@/lib/server/feature-flags";
import { logAdminAction } from "@/lib/server/admin-audit";
import { appBaseUrl } from "@/lib/server/app-url";
import { db } from "@/lib/server/db";
import {
  createPromotionalInvite,
  previewPromotionalInvites,
} from "@/lib/server/promotional-invites";
import { sendPromotionalInviteEmail } from "@/lib/server/email";
import { promotionalInvites } from "@incidentrank/db";
import { eq } from "drizzle-orm";

interface CreateInvitesBody {
  emails?: unknown;
  campaign?: unknown;
  expiresAt?: unknown;
  confirm?: unknown;
}

/**
 * Admin-only: preview (confirm=false/omitted) or create+send (confirm=true)
 * a batch of promotional invites. The two-phase shape matches
 * docs/implementation_plan/phase8_admin_promotional_access_referrals.md
 * §7.2's "Admin confirms before sending" — no DB rows are created on the
 * preview call at all (phase8loc.md Step 6).
 */
export async function POST(request: Request) {
  if (!isPromotionalInvitesEnabled()) {
    return NextResponse.json({ error: "Promotional invites are not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await loadAdminMembership(user);
  if (!membership.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as CreateInvitesBody | null;
  if (!body || !Array.isArray(body.emails)) {
    return NextResponse.json({ error: "emails must be an array of strings" }, { status: 400 });
  }
  const emails = body.emails.filter((e): e is string => typeof e === "string");
  const campaign = typeof body.campaign === "string" && body.campaign.trim().length > 0
    ? body.campaign.trim()
    : null;
  const expiresAt =
    typeof body.expiresAt === "string" && !Number.isNaN(Date.parse(body.expiresAt))
      ? new Date(body.expiresAt)
      : undefined;

  const preview = await previewPromotionalInvites(emails, campaign);

  if (body.confirm !== true) {
    return NextResponse.json({ preview });
  }

  const created = [];
  for (const email of preview.valid) {
    const { invite, token } = await createPromotionalInvite({
      email,
      campaign,
      expiresAt,
      createdByUserId: user.id,
    });

    await logAdminAction(db, {
      adminUserId: user.id,
      action: "promo_invite_created",
      targetType: "promotional_invite",
      targetId: invite.id,
      metadata: { campaign },
    });

    const sendResult = await sendPromotionalInviteEmail({
      to: invite.email,
      inviteUrl: `${appBaseUrl()}/invite/${token}`,
    });

    if (sendResult.ok) {
      await db
        .update(promotionalInvites)
        .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
        .where(eq(promotionalInvites.id, invite.id));
      await logAdminAction(db, {
        adminUserId: user.id,
        action: "promo_invite_sent",
        targetType: "promotional_invite",
        targetId: invite.id,
      });
    } else {
      await db
        .update(promotionalInvites)
        .set({ status: "send_failed", updatedAt: new Date() })
        .where(eq(promotionalInvites.id, invite.id));
    }

    created.push({
      id: invite.id,
      email: invite.email,
      status: sendResult.ok ? "sent" : "send_failed",
    });
  }

  return NextResponse.json({ preview, created });
}
