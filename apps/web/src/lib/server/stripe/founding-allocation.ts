import "server-only";
import { eq, sql } from "drizzle-orm";
import { foundingEngineerAllocations, type FoundingEngineerAllocation } from "@incidentrank/db";
import { db } from "../db";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type ReserveFoundingSlotResult =
  | { ok: true; allocation: FoundingEngineerAllocation }
  | { ok: false; reason: "sold_out" | "already_reserved" };

/**
 * Claims the lowest-numbered free Founding Engineer slot for `userId`
 * (docs/implementation_plan/phase9.md §22-§25). `FOR UPDATE SKIP LOCKED`
 * is the standard Postgres-safe concurrent-claim pattern: two
 * simultaneous callers racing for the last slot each try to lock a
 * candidate row; the loser skips rows the winner already locked rather
 * than blocking on them, so it correctly falls through to "no free slot"
 * instead of either deadlocking or double-claiming the same slot. This
 * guarantees at most 100 rows are ever in ('reserved','issued')
 * simultaneously without any separate counter or advisory lock to keep
 * in sync.
 *
 * Must be called inside a transaction (`tx`) so the row lock is held for
 * the duration of Checkout Session creation — see checkout.ts.
 */
export async function reserveFoundingSlot(
  tx: TxOrDb,
  userId: string,
): Promise<ReserveFoundingSlotResult> {
  const existing = await tx.query.foundingEngineerAllocations.findFirst({
    where: (table, { and, eq: eqFn, inArray }) =>
      and(eqFn(table.userId, userId), inArray(table.status, ["reserved", "issued"])),
  });
  if (existing) {
    return existing.status === "issued"
      ? { ok: false, reason: "already_reserved" }
      : { ok: true, allocation: existing };
  }

  // Raw SQL (rather than Drizzle's query builder) because the "claim the
  // lowest free slot" operation is an UPDATE whose WHERE target comes
  // from a correlated subquery with FOR UPDATE SKIP LOCKED — no
  // query-builder expression for that subquery-as-target shape exists.
  // Returns only `id`: postgres-js's raw .execute() rows carry literal
  // snake_case Postgres column names (no camelCase transform is
  // configured on this client, see packages/db/src/client.ts), so rather
  // than hand-mapping a full row we re-read the claimed row through
  // Drizzle's typed query builder by id immediately below.
  //
  // Concurrency note: the `existing` check above is not itself race-safe
  // — two simultaneous calls for the SAME user can both pass it before
  // either commits, then both claim a (different) free slot via this
  // UPDATE. The second UPDATE to actually execute blocks on
  // founding_engineer_allocations_one_active_per_user_idx (the partial
  // unique index on userId WHERE status IN ('reserved','issued')) until
  // the first commits, then raises a unique-violation (Postgres error
  // code 23505) rather than succeeding — caught here and treated as the
  // same "already_reserved" outcome the `existing` check models in the
  // non-racing case, so a double-click never surfaces as an unhandled
  // 500 (and never burns a slot the second transaction can't use).
  let claimed: { id: string }[];
  try {
    claimed = Array.from(
      await tx.execute<{ id: string }>(sql`
        UPDATE founding_engineer_allocations
        SET status = 'reserved', user_id = ${userId}, reserved_at = now()
        WHERE slot_number = (
          SELECT slot_number
          FROM founding_engineer_allocations
          WHERE status IN ('released', 'expired')
          ORDER BY slot_number
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id
      `),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: unknown }).code === "23505"
    ) {
      return { ok: false, reason: "already_reserved" };
    }
    throw error;
  }

  const claimedId = claimed[0]?.id;
  if (!claimedId) {
    return { ok: false, reason: "sold_out" };
  }

  const allocation = await tx.query.foundingEngineerAllocations.findFirst({
    where: eq(foundingEngineerAllocations.id, claimedId),
  });
  if (!allocation) {
    throw new Error("Claimed Founding allocation row disappeared within the same transaction");
  }
  return { ok: true, allocation };
}

/** Converts a reserved slot into permanently issued — never reversible by normal subscription-cancellation logic. */
export async function issueFoundingSlot(
  tx: TxOrDb,
  allocationId: string,
  stripePaymentIntentId: string | null,
): Promise<FoundingEngineerAllocation | null> {
  const [updated] = await tx
    .update(foundingEngineerAllocations)
    .set({
      status: "issued",
      issuedAt: new Date(),
      stripePaymentIntentId,
    })
    .where(
      sql`${foundingEngineerAllocations.id} = ${allocationId} AND ${foundingEngineerAllocations.status} = 'reserved'`,
    )
    .returning();
  return updated ?? null;
}

/**
 * Releases a reservation back to the free pool — called when Checkout
 * Session creation fails (phase9.md §24) or an abandoned/expired
 * reservation is cleaned up. An already-issued slot is never released by
 * this path (the WHERE clause only matches status='reserved').
 */
export async function releaseFoundingSlot(
  tx: TxOrDb,
  allocationId: string,
): Promise<FoundingEngineerAllocation | null> {
  const [updated] = await tx
    .update(foundingEngineerAllocations)
    .set({ status: "released", userId: null, releasedAt: new Date() })
    .where(
      sql`${foundingEngineerAllocations.id} = ${allocationId} AND ${foundingEngineerAllocations.status} = 'reserved'`,
    )
    .returning();
  return updated ?? null;
}

export async function setFoundingSlotCheckoutSession(
  tx: TxOrDb,
  allocationId: string,
  stripeCheckoutSessionId: string,
): Promise<void> {
  await tx
    .update(foundingEngineerAllocations)
    .set({ stripeCheckoutSessionId })
    .where(eq(foundingEngineerAllocations.id, allocationId));
}

export interface FoundingCapacity {
  issued: number;
  reserved: number;
  remaining: number;
  soldOut: boolean;
}

/** Live capacity counts for the pricing page (phase9.md §33). */
export async function getFoundingCapacity(): Promise<FoundingCapacity> {
  const rows = await db.query.foundingEngineerAllocations.findMany({
    columns: { status: true },
  });
  const issued = rows.filter((r) => r.status === "issued").length;
  const reserved = rows.filter((r) => r.status === "reserved").length;
  const remaining = Math.max(0, rows.length - issued - reserved);
  return { issued, reserved, remaining, soldOut: remaining === 0 };
}
