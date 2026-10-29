import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { updatePrivacyRequestStatus } from "@/lib/server/privacy-requests";
import { logAdminAction } from "@/lib/server/admin-audit";
import { db } from "@/lib/server/db";

interface UpdateStatusBody {
  status?: unknown;
}

/**
 * Phase 10D §44/§52. Admin-only status update (pending -> completed).
 * Logs privacy_request_completed — never the request's notes content.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
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

  const { requestId } = await params;
  const body = (await request.json().catch(() => null)) as UpdateStatusBody | null;
  if (body?.status !== "completed") {
    return NextResponse.json({ error: "status must be \"completed\"" }, { status: 400 });
  }

  const updated = await updatePrivacyRequestStatus(requestId, "completed");

  await logAdminAction(db, {
    adminUserId: user.id,
    action: "privacy_request_completed",
    targetType: "privacy_request",
    targetId: updated.id,
  });

  return NextResponse.json({ request: updated });
}
