import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-audit";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

const STATUS_VALUES = ["draft", "published", "archived"] as const;
const STRUCTURE_VALUES = ["linear", "branching", "parallel", "cascading"] as const;
const DOMAIN_VALUES = [
  "Databases & Storage",
  "Messaging & Streaming",
  "Caching",
  "Microservices & Dependencies",
  "API & Traffic",
  "Distributed Systems",
  "Deployments & Reliability",
  "Infrastructure & Capacity",
  "Security & Identity",
  "Data Pipelines",
] as const;

interface PatchScenarioBody {
  isFree?: unknown;
  isFreeOverriddenByAdmin?: unknown;
  status?: unknown;
  structure?: unknown;
  domain?: unknown;
  releaseWeek?: unknown;
  publishedAt?: unknown;
}

/**
 * Platform-admin scenario metadata editor write path (Phase 10G §2/§3).
 * Edits only the DB-row-backed Phase 10F/10G metadata — never an
 * organization-owned scenario's definitionJson, never a built-in
 * scenario's TypeScript source. Mirrors the credit-adjustment route's
 * exact shape: isAdminPortalEnabled -> getOrCreateCurrentUser ->
 * loadAdminMembership -> validate -> db.transaction(update + audit row)
 * -> client router.refresh().
 *
 * Any request that sets `isFree` also stamps isFreeOverriddenByAdmin=true
 * (packages/db/src/seed.ts's upsert respects this flag so a future
 * `pnpm db:seed` never silently reverts an admin's free/paid decision) —
 * unless the request is the explicit, narrower
 * `{isFreeOverriddenByAdmin: false}` reset action, which clears the flag
 * without touching isFree itself.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ scenarioId: string }> },
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

  const { scenarioId } = await params;
  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, scenarioId),
  });
  if (!scenario) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as PatchScenarioBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Narrow reset action: clears the override flag only, touches nothing
  // else. Checked first so a reset request can never also be mistaken
  // for a no-op full update (every other field below is optional/unset).
  if (
    body.isFreeOverriddenByAdmin === false &&
    body.isFree === undefined &&
    body.status === undefined &&
    body.structure === undefined &&
    body.domain === undefined &&
    body.releaseWeek === undefined &&
    body.publishedAt === undefined
  ) {
    const result = await db.transaction(async (tx) => {
      await tx
        .update(scenarios)
        .set({ isFreeOverriddenByAdmin: false })
        .where(eq(scenarios.id, scenarioId));
      await logAdminAction(tx, {
        adminUserId: user.id,
        action: "scenario_reset_free_override",
        targetType: "scenario",
        targetId: scenarioId,
        metadata: null,
      });
      return { ok: true };
    });
    return NextResponse.json(result);
  }

  const update: Partial<typeof scenarios.$inferInsert> = {};

  if (body.isFree !== undefined) {
    if (typeof body.isFree !== "boolean") {
      return NextResponse.json({ error: "isFree must be a boolean" }, { status: 400 });
    }
    update.isFree = body.isFree;
    update.isFreeOverriddenByAdmin = true;
  }

  if (body.status !== undefined) {
    if (
      typeof body.status !== "string" ||
      !STATUS_VALUES.includes(body.status as (typeof STATUS_VALUES)[number])
    ) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status as (typeof STATUS_VALUES)[number];
  }

  if (body.structure !== undefined) {
    if (
      typeof body.structure !== "string" ||
      !STRUCTURE_VALUES.includes(body.structure as (typeof STRUCTURE_VALUES)[number])
    ) {
      return NextResponse.json({ error: "Invalid structure" }, { status: 400 });
    }
    update.structure = body.structure as (typeof STRUCTURE_VALUES)[number];
  }

  if (body.domain !== undefined) {
    if (body.domain !== null) {
      if (
        typeof body.domain !== "string" ||
        !DOMAIN_VALUES.includes(body.domain as (typeof DOMAIN_VALUES)[number])
      ) {
        return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
      }
      update.domain = body.domain as (typeof DOMAIN_VALUES)[number];
    } else {
      update.domain = null;
    }
  }

  if (body.releaseWeek !== undefined) {
    if (body.releaseWeek !== null && typeof body.releaseWeek !== "string") {
      return NextResponse.json({ error: "Invalid releaseWeek" }, { status: 400 });
    }
    update.releaseWeek = body.releaseWeek;
  }

  if (body.publishedAt !== undefined) {
    if (body.publishedAt === null) {
      update.publishedAt = null;
    } else {
      if (typeof body.publishedAt !== "string") {
        return NextResponse.json({ error: "Invalid publishedAt" }, { status: 400 });
      }
      const parsed = new Date(body.publishedAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: "Invalid publishedAt" }, { status: 400 });
      }
      update.publishedAt = parsed;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  await db.transaction(async (tx) => {
    await tx.update(scenarios).set(update).where(eq(scenarios.id, scenarioId));
    await logAdminAction(tx, {
      adminUserId: user.id,
      action: "scenario_metadata_update",
      targetType: "scenario",
      targetId: scenarioId,
      metadata: update as Record<string, unknown>,
    });
  });

  return NextResponse.json({ ok: true });
}
