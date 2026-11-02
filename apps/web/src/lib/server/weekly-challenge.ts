import "server-only";
import { and, eq } from "drizzle-orm";
import { scenarios, weeklyChallenges, type WeeklyChallenge } from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

/**
 * docs/implementation_plan/phase-challege-version.md §2 — the single
 * admin-selected built-in scenario currently playable free regardless of
 * its normal paid/free status. At most one row is ever active at a time
 * (enforced at the DB level by weekly_challenges_one_active_idx, a
 * partial unique index on `active` — see schema.ts's comment), so "the"
 * active challenge is always unambiguous.
 */
export async function getActiveWeeklyChallenge(
  tx: TxOrDb = db,
): Promise<WeeklyChallenge | null> {
  const row = await tx.query.weeklyChallenges.findFirst({
    where: eq(weeklyChallenges.active, true),
  });
  return row ?? null;
}

/**
 * The one check every practice-access call site folds into its own
 * `isFree` resolution (§3: "practice access = scenario is normally free
 * OR scenario is current active Weekly Challenge OR ..."). Never derives
 * anything about paid entitlements/passes itself — purely "is this exact
 * scenario id the currently active challenge."
 */
export async function isCurrentWeeklyChallenge(scenarioId: string): Promise<boolean> {
  const active = await getActiveWeeklyChallenge();
  return active?.scenarioId === scenarioId;
}

/**
 * Slug-based sibling of isCurrentWeeklyChallenge for call sites that only
 * have a scenario slug in hand (the anonymous score-preview/finish-
 * preview routes, which resolve built-in scenarios directly from the
 * catalog rather than loading a full scenario row) — scoped to
 * ownershipType="incidentrank", same as every other built-in scenario
 * lookup in this codebase, since a weekly challenge is always a built-in
 * scenario (§2).
 */
export async function isCurrentWeeklyChallengeSlug(slug: string): Promise<boolean> {
  const active = await getActiveWeeklyChallenge();
  if (!active) return false;
  const scenario = await db.query.scenarios.findFirst({
    where: and(eq(scenarios.id, active.scenarioId), eq(scenarios.slug, slug)),
    columns: { id: true },
  });
  return scenario !== undefined;
}

export interface ActivateWeeklyChallengeInput {
  scenarioId: string;
  adminUserId: string;
  startsAt?: Date;
  endsAt?: Date | null;
}

/**
 * Deactivates any currently-active challenge and inserts the new one,
 * atomically, in the same transaction the caller provides — "replace the
 * current challenge" (§2) must never pass through a moment with either
 * zero or two active rows. The caller (the admin API route) is
 * responsible for the db.transaction wrapper and for calling
 * logAdminAction afterward, mirroring adjustOrganizationCredit's exact
 * shape (apps/web/src/lib/server/organization-credits.ts) — this
 * function stays a plain data operation, never an admin-audit concern.
 */
export async function activateWeeklyChallenge(
  tx: TxOrDb,
  input: ActivateWeeklyChallengeInput,
): Promise<WeeklyChallenge> {
  await tx
    .update(weeklyChallenges)
    .set({ active: false })
    .where(eq(weeklyChallenges.active, true));

  const [created] = await tx
    .insert(weeklyChallenges)
    .values({
      scenarioId: input.scenarioId,
      createdByUserId: input.adminUserId,
      startsAt: input.startsAt ?? new Date(),
      endsAt: input.endsAt ?? null,
      active: true,
    })
    .returning();
  if (!created) throw new Error("Failed to create weekly challenge");
  return created;
}

/** Deactivates the current challenge, if any — a no-op if none is active. */
export async function deactivateWeeklyChallenge(tx: TxOrDb): Promise<void> {
  await tx
    .update(weeklyChallenges)
    .set({ active: false, endsAt: new Date() })
    .where(eq(weeklyChallenges.active, true));
}
