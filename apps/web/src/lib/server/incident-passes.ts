import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { incidentPasses, type IncidentPass, type Scenario } from "@incidentrank/db";
import { db } from "./db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type IncidentPassSourceType = IncidentPass["sourceType"];

/**
 * Grants exactly one available Incident Pass for `userId`. Relies on
 * incident_passes_source_idx (unique on (sourceType, sourceId) where
 * sourceId is not null) to guarantee one promo invite or one referral
 * reward can never produce two passes, even under a concurrent-request
 * race — a second grant attempt for the same source returns null rather
 * than a duplicate row, and the caller treats that as "already granted."
 * sourceId is null (and thus never conflict-checked) only for an
 * admin_grant with no originating row, which is intentionally
 * ungoverned by this uniqueness (an admin may grant multiple ad-hoc
 * passes to the same user).
 */
export async function grantIncidentPass(
  tx: TxOrDb,
  input: {
    userId: string;
    sourceType: IncidentPassSourceType;
    sourceId?: string | null;
  },
): Promise<IncidentPass | null> {
  const sourceId = input.sourceId ?? null;

  // For an admin_grant with no sourceId, the partial unique index never
  // applies (its predicate is "sourceId IS NOT NULL") — skip the
  // onConflictDoNothing clause entirely in that case, since Postgres
  // rejects ON CONFLICT targeting a partial index unless the INSERT's
  // own values could actually match that index's predicate... in
  // practice a plain insert is simplest and correct here: an
  // admin_grant is intentionally never deduplicated.
  if (sourceId === null) {
    const [created] = await tx
      .insert(incidentPasses)
      .values({
        userId: input.userId,
        sourceType: input.sourceType,
        sourceId: null,
        status: "available",
      })
      .returning();
    return created ?? null;
  }

  const [created] = await tx
    .insert(incidentPasses)
    .values({
      userId: input.userId,
      sourceType: input.sourceType,
      sourceId,
      status: "available",
    })
    // Must exactly match incident_passes_source_idx's partial predicate
    // (WHERE source_id IS NOT NULL), confirmed directly against the dev
    // DB — otherwise Postgres rejects the ON CONFLICT clause outright.
    .onConflictDoNothing({
      target: [incidentPasses.sourceType, incidentPasses.sourceId],
      where: sql`${incidentPasses.sourceId} IS NOT NULL`,
    })
    .returning();
  return created ?? null;
}

/** The source row this pass was already granted for, if any (idempotent re-grant lookup). */
export async function findPassBySource(
  sourceType: IncidentPassSourceType,
  sourceId: string,
): Promise<IncidentPass | null> {
  const row = await db.query.incidentPasses.findFirst({
    where: and(
      eq(incidentPasses.sourceType, sourceType),
      eq(incidentPasses.sourceId, sourceId),
    ),
  });
  return row ?? null;
}

export type BindIncidentPassResult =
  | { ok: true; pass: IncidentPass }
  | { ok: false; reason: "not_found" | "not_owner" | "not_available" | "scenario_ineligible" };

/**
 * Binds an available pass to exactly one scenario. Atomic: the UPDATE is
 * scoped to `WHERE status = 'available'`, so two concurrent bind
 * requests for the same pass can never both succeed — the loser's UPDATE
 * affects zero rows and this returns `not_available` rather than
 * silently overwriting the winner's scenarioId (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §11 / phase8loc.md Step
 * 4's "Binding must be atomic"). Once bound, a pass can never move to a
 * different scenario — there is deliberately no "rebind" operation.
 */
export async function bindIncidentPass(
  tx: TxOrDb,
  input: { passId: string; userId: string; scenario: Pick<Scenario, "id" | "isActive"> },
): Promise<BindIncidentPassResult> {
  const pass = await tx.query.incidentPasses.findFirst({
    where: eq(incidentPasses.id, input.passId),
  });
  if (!pass) return { ok: false, reason: "not_found" };
  if (pass.userId !== input.userId) return { ok: false, reason: "not_owner" };
  if (!input.scenario.isActive) return { ok: false, reason: "scenario_ineligible" };

  const [updated] = await tx
    .update(incidentPasses)
    .set({ scenarioId: input.scenario.id, status: "bound", boundAt: new Date() })
    .where(and(eq(incidentPasses.id, input.passId), eq(incidentPasses.status, "available")))
    .returning();

  if (!updated) return { ok: false, reason: "not_available" };
  return { ok: true, pass: updated };
}

export type ConsumeIncidentPassResult =
  | { ok: true; pass: IncidentPass }
  | { ok: false; reason: "not_found" | "not_owner" | "not_bound_to_scenario" };

/**
 * Consumes a pass already bound to `scenarioId`, on the actual start of
 * that scenario's attempt (incidentStartedAt becoming non-null). Scoped
 * to `WHERE status = 'bound' AND scenarioId = X`, so a concurrent
 * double-start attempt can consume the pass at most once — the caller
 * (POST /api/attempts) wraps this in the same transaction as the attempt
 * INSERT, so "pass consumed" and "attempt created with this pass
 * linked" happen atomically together.
 */
export async function consumeIncidentPass(
  tx: TxOrDb,
  input: { passId: string; userId: string; scenarioId: string },
): Promise<ConsumeIncidentPassResult> {
  const pass = await tx.query.incidentPasses.findFirst({
    where: eq(incidentPasses.id, input.passId),
  });
  if (!pass) return { ok: false, reason: "not_found" };
  if (pass.userId !== input.userId) return { ok: false, reason: "not_owner" };

  const [updated] = await tx
    .update(incidentPasses)
    .set({ status: "consumed", consumedAt: new Date() })
    .where(
      and(
        eq(incidentPasses.id, input.passId),
        eq(incidentPasses.status, "bound"),
        eq(incidentPasses.scenarioId, input.scenarioId),
      ),
    )
    .returning();

  if (!updated) return { ok: false, reason: "not_bound_to_scenario" };
  return { ok: true, pass: updated };
}

/** The user's single available-or-bound pass, if any — a user holds at most one active pass at a time in V1. */
export async function findAvailableOrBoundPass(userId: string): Promise<IncidentPass | null> {
  const row = await db.query.incidentPasses.findFirst({
    where: and(
      eq(incidentPasses.userId, userId),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  if (!row) return null;
  if (row.status !== "available" && row.status !== "bound") return null;
  return row;
}

/** The user's pass currently bound (or already consumed) for this exact scenario, if any. */
export async function findPassForScenario(
  userId: string,
  scenarioId: string,
): Promise<IncidentPass | null> {
  const row = await db.query.incidentPasses.findFirst({
    where: and(
      eq(incidentPasses.userId, userId),
      eq(incidentPasses.scenarioId, scenarioId),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  return row ?? null;
}
