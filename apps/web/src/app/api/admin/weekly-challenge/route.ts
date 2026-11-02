import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-audit";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import {
  activateWeeklyChallenge,
  deactivateWeeklyChallenge,
  getActiveWeeklyChallenge,
} from "@/lib/server/weekly-challenge";

interface PatchWeeklyChallengeBody {
  scenarioId?: unknown;
  action?: unknown;
}

/**
 * docs/implementation_plan/phase-challege-version.md §2/§13 — the single
 * admin control surface for the Weekly Challenge. Mirrors
 * /api/admin/scenarios/[scenarioId]'s exact shape: isAdminPortalEnabled
 * -> getOrCreateCurrentUser -> loadAdminMembership -> validate ->
 * db.transaction(mutation + audit row).
 */
export async function GET() {
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

  const [active, builtInScenarios] = await Promise.all([
    getActiveWeeklyChallenge(),
    db.query.scenarios.findMany({
      where: eq(scenarios.ownershipType, "incidentrank"),
      orderBy: (table, { asc }) => [asc(table.slug)],
      columns: { id: true, slug: true, name: true, isFree: true },
    }),
  ]);

  let activeScenario = null;
  if (active) {
    activeScenario = builtInScenarios.find((row) => row.id === active.scenarioId) ?? null;
  }

  return NextResponse.json({
    active: active ? { ...active, scenario: activeScenario } : null,
    scenarios: builtInScenarios,
  });
}

export async function PATCH(request: Request) {
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

  const body = (await request.json().catch(() => null)) as PatchWeeklyChallengeBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "deactivate") {
    await db.transaction(async (tx) => {
      await deactivateWeeklyChallenge(tx);
      await logAdminAction(tx, {
        adminUserId: user.id,
        action: "weekly_challenge_deactivated",
        targetType: "weekly_challenge",
        targetId: null,
        metadata: null,
      });
    });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.scenarioId !== "string") {
    return NextResponse.json({ error: "scenarioId is required" }, { status: 400 });
  }

  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, body.scenarioId),
  });
  if (!scenario || scenario.ownershipType !== "incidentrank") {
    return NextResponse.json({ error: "Unknown built-in scenario" }, { status: 404 });
  }

  const created = await db.transaction(async (tx) => {
    const challenge = await activateWeeklyChallenge(tx, {
      scenarioId: scenario.id,
      adminUserId: user.id,
    });
    await logAdminAction(tx, {
      adminUserId: user.id,
      action: "weekly_challenge_activated",
      targetType: "weekly_challenge",
      targetId: challenge.id,
      metadata: { scenarioId: scenario.id, scenarioSlug: scenario.slug },
    });
    return challenge;
  });

  return NextResponse.json({ ok: true, active: created });
}
