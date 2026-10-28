import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { users } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-audit";
import { isAdminPortalEnabled, isEngineerRankEnabled } from "@/lib/server/feature-flags";
import { rebuildAndPersistRank } from "@/lib/server/engineer-rank";

/**
 * Platform-admin Engineer Rank rebuild (docs/implementation_plan/
 * phase10c.md §58). Recomputes a user's rank from scratch and
 * unconditionally inserts a fresh snapshot, even if identical to the
 * latest existing one — a rebuild must be unconditionally honest about
 * current state. Any active platform admin may call this (read-mostly,
 * additive-only effect on rank_snapshots — no owner-gating per spec §39).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  if (!isAdminPortalEnabled() || !isEngineerRankEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const adminUser = await getOrCreateCurrentUser();
  if (!adminUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await loadAdminMembership(adminUser);
  if (!membership.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await params;
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await rebuildAndPersistRank(targetUser.id);

  await db.transaction((tx) =>
    logAdminAction(tx, {
      adminUserId: adminUser.id,
      action: "engineer_rank_rebuild",
      targetType: "user",
      targetId: targetUser.id,
      metadata: { rankBand: result.rankBand, qualifyingAttempts: result.qualifyingAttempts },
    }),
  );

  return NextResponse.json({
    rankBand: result.rankBand,
    provisional: result.provisional,
    confidence: result.confidence,
    qualifyingAttempts: result.qualifyingAttempts,
  });
}
