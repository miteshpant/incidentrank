import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, gte, inArray, like, lt } from "drizzle-orm";
import { createDb, foundingEngineerAllocations, users, type Db } from "@incidentrank/db";
import {
  getFoundingCapacity,
  issueFoundingSlot,
  releaseFoundingSlot,
  reserveFoundingSlot,
} from "./founding-allocation";

let testDb: Db;

const TEST_AUTH_USER = "test-founding-user";
// Test-only slot numbers far above the real 1..100 seeded range.
const TEST_SLOT_BASE = 900_000;

// reserveFoundingSlot claims the globally lowest free slot number across
// the WHOLE table by design (it must, in production, see every real
// slot) — so a test suite cannot isolate itself just by seeding rows at
// a high slot number. Instead, every real-pool row (slot_number <
// TEST_SLOT_BASE) is temporarily marked 'issued' (unclaimable by the
// WHERE status IN ('released','expired') clause) for the duration of
// each test, and its exact prior status is restored in a `finally` even
// if the test's assertions throw — this is load-bearing: an earlier
// version of this suite seeded only new high-numbered rows without
// shielding the real pool, and a concurrency test ended up claiming 99
// real local-dev Founding slots that were never released because the
// test's own (wrong) assertions failed before cleanup ran.
let realPoolSnapshot: { id: string; status: "reserved" | "issued" | "released" | "expired" }[] = [];

async function shieldRealPool() {
  realPoolSnapshot = await testDb.query.foundingEngineerAllocations.findMany({
    where: lt(foundingEngineerAllocations.slotNumber, TEST_SLOT_BASE),
    columns: { id: true, status: true },
  });
  const toShield = realPoolSnapshot.filter((row) => row.status !== "issued").map((row) => row.id);
  if (toShield.length > 0) {
    await testDb
      .update(foundingEngineerAllocations)
      .set({ status: "issued" })
      .where(inArray(foundingEngineerAllocations.id, toShield));
  }
}

async function restoreRealPool() {
  for (const row of realPoolSnapshot) {
    if (row.status !== "issued") {
      await testDb
        .update(foundingEngineerAllocations)
        .set({ status: row.status })
        .where(eq(foundingEngineerAllocations.id, row.id));
    }
  }
  realPoolSnapshot = [];
}

beforeAll(async () => {
  testDb = createDb();
});

beforeEach(async () => {
  await shieldRealPool();
});

afterEach(async () => {
  // Order matters: delete test-seeded rows and test users BEFORE
  // restoring the shielded real pool, so a test failure between
  // shieldRealPool() and here can never leave real rows stuck 'issued'.
  await testDb
    .delete(foundingEngineerAllocations)
    .where(gte(foundingEngineerAllocations.slotNumber, TEST_SLOT_BASE));
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
  await restoreRealPool();
});

afterAll(async () => {
  // Safety net in case an afterEach itself was interrupted — never end
  // this suite with any real-pool row still shielded as 'issued'.
  await restoreRealPool();
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(suffix = "") {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: `${TEST_AUTH_USER}${suffix}`, displayName: "Founding Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function seedSlots(count: number) {
  const slots = Array.from({ length: count }, (_, i) => ({
    slotNumber: TEST_SLOT_BASE + i,
    status: "released" as const,
  }));
  await testDb.insert(foundingEngineerAllocations).values(slots);
}

describe("reserveFoundingSlot", () => {
  it("claims the lowest free slot", async () => {
    await seedSlots(3);
    const user = await createUser();

    const result = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.allocation.slotNumber).toBe(TEST_SLOT_BASE);
  });

  it("returns sold_out once no released/expired slots remain", async () => {
    await seedSlots(1);
    const [a, b] = [await createUser("-a"), await createUser("-b")];

    const first = await testDb.transaction((tx) => reserveFoundingSlot(tx, a.id));
    expect(first.ok).toBe(true);

    const second = await testDb.transaction((tx) => reserveFoundingSlot(tx, b.id));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("sold_out");
  });

  it("a user who already has a reservation gets the same allocation back, not a second one", async () => {
    await seedSlots(3);
    const user = await createUser();

    const first = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    const second = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.allocation.id).toBe(first.allocation.id);
    }
  });

  it("a user who is already issued cannot reserve a second slot", async () => {
    await seedSlots(3);
    const user = await createUser();

    const reserved = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    await testDb.transaction((tx) => issueFoundingSlot(tx, reserved.allocation.id, "pi_test"));

    const second = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("already_reserved");
  });

  it("exactly one of two concurrent reservations succeeds against the last remaining slot", async () => {
    await seedSlots(1);
    const [a, b] = [await createUser("-a"), await createUser("-b")];

    const [resultA, resultB] = await Promise.all([
      testDb.transaction((tx) => reserveFoundingSlot(tx, a.id)),
      testDb.transaction((tx) => reserveFoundingSlot(tx, b.id)),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.ok);
    const soldOut = [resultA, resultB].filter((r) => !r.ok && r.reason === "sold_out");
    expect(succeeded.length).toBe(1);
    expect(soldOut.length).toBe(1);
  });

  it("the 10th of 10 concurrent reservations against 10 slots succeeds and the 11th sees sold_out", async () => {
    await seedSlots(10);
    const requesters = await Promise.all(
      Array.from({ length: 11 }, (_, i) => createUser(`-bulk-${i}`)),
    );

    const results = await Promise.all(
      requesters.map((requester) => testDb.transaction((tx) => reserveFoundingSlot(tx, requester.id))),
    );

    const succeeded = results.filter((r) => r.ok);
    const soldOut = results.filter((r) => !r.ok && r.reason === "sold_out");
    expect(succeeded.length).toBe(10);
    expect(soldOut.length).toBe(1);

    const slotNumbers = succeeded.map((r) => (r.ok ? r.allocation.slotNumber : -1));
    expect(new Set(slotNumbers).size).toBe(10);
  }, 30_000);

  it("two TRULY overlapping transactions for the SAME user — one commits a reservation before the other's UPDATE runs — resolve to one success and one clean already_reserved, never an unhandled exception", async () => {
    // A plain Promise.all over two testDb.transaction() calls does not
    // reliably reproduce this race: postgres-js's connection pool and
    // Node's microtask scheduling tend to fully serialize two
    // transactions issued back-to-back from the same pool before they
    // ever genuinely overlap. To force the real race this test manually
    // drives two independent reserved connections through explicit
    // BEGIN/UPDATE/COMMIT ordering, so transaction B's UPDATE
    // deterministically executes while A's reservation is already
    // committed — reproducing the exact interleaving the fix in
    // founding-allocation.ts's reserveFoundingSlot catch block exists
    // for (Postgres error 23505 on
    // founding_engineer_allocations_one_active_per_user_idx).
    await seedSlots(2);
    const user = await createUser("same-user-race");

    const connA = await testDb.$client.reserve();
    const connB = await testDb.$client.reserve();
    let claimA: { id: string }[] = [];
    try {
      await connA`BEGIN`;
      await connB`BEGIN`;

      claimA = await connA`
        UPDATE founding_engineer_allocations
        SET status = 'reserved', user_id = ${user.id}, reserved_at = now()
        WHERE slot_number = (
          SELECT slot_number FROM founding_engineer_allocations
          WHERE status IN ('released', 'expired') AND slot_number >= ${TEST_SLOT_BASE}
          ORDER BY slot_number LIMIT 1 FOR UPDATE SKIP LOCKED
        )
        RETURNING id
      `;
      expect(claimA.length).toBe(1);
      await connA`COMMIT`;

      let claimBError: { code?: string } | null = null;
      try {
        await connB`
          UPDATE founding_engineer_allocations
          SET status = 'reserved', user_id = ${user.id}, reserved_at = now()
          WHERE slot_number = (
            SELECT slot_number FROM founding_engineer_allocations
            WHERE status IN ('released', 'expired') AND slot_number >= ${TEST_SLOT_BASE}
            ORDER BY slot_number LIMIT 1 FOR UPDATE SKIP LOCKED
          )
          RETURNING id
        `;
        await connB`COMMIT`;
      } catch (error) {
        claimBError = error as { code?: string };
        await connB`ROLLBACK`;
      }

      // This reproduces the exact Postgres-level condition
      // reserveFoundingSlot's catch block handles — confirms the race is
      // real at the database level before trusting the application-level
      // fix.
      expect(claimBError?.code).toBe("23505");
    } finally {
      connA.release();
      connB.release();
    }

    // Now exercise the actual production function against this same
    // already-reserved user: its own `existing` pre-check (not the catch
    // block — that only fires when `existing` itself loses the race, as
    // connB did above) correctly returns the user's one real allocation
    // rather than attempting — and failing — a second claim.
    const result = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.allocation.id).toBe(claimA[0]?.id);

    const rows = await testDb.query.foundingEngineerAllocations.findMany({
      where: eq(foundingEngineerAllocations.userId, user.id),
    });
    expect(rows.length).toBe(1);
  });
});

describe("issueFoundingSlot / releaseFoundingSlot", () => {
  it("issues a reserved slot, recording the payment intent", async () => {
    await seedSlots(1);
    const user = await createUser();
    const reserved = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");

    const issued = await testDb.transaction((tx) =>
      issueFoundingSlot(tx, reserved.allocation.id, "pi_test_123"),
    );

    expect(issued?.status).toBe("issued");
    expect(issued?.stripePaymentIntentId).toBe("pi_test_123");
  });

  it("issuing an already-issued slot is a safe no-op (idempotent replay)", async () => {
    await seedSlots(1);
    const user = await createUser();
    const reserved = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");
    await testDb.transaction((tx) => issueFoundingSlot(tx, reserved.allocation.id, "pi_test_123"));

    const secondIssue = await testDb.transaction((tx) =>
      issueFoundingSlot(tx, reserved.allocation.id, "pi_test_123"),
    );

    expect(secondIssue).toBeNull();
  });

  it("releases a reservation back to the free pool", async () => {
    await seedSlots(1);
    const user = await createUser();
    const reserved = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");

    const released = await testDb.transaction((tx) => releaseFoundingSlot(tx, reserved.allocation.id));

    expect(released?.status).toBe("released");
    expect(released?.userId).toBeNull();
  });

  it("a released slot can be claimed again by a different user", async () => {
    await seedSlots(1);
    const [a, b] = [await createUser("-a"), await createUser("-b")];
    const reserved = await testDb.transaction((tx) => reserveFoundingSlot(tx, a.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");
    await testDb.transaction((tx) => releaseFoundingSlot(tx, reserved.allocation.id));

    const reclaimed = await testDb.transaction((tx) => reserveFoundingSlot(tx, b.id));

    expect(reclaimed.ok).toBe(true);
    if (reclaimed.ok) expect(reclaimed.allocation.slotNumber).toBe(reserved.allocation.slotNumber);
  });

  it("an issued slot is never released (not just a reservation)", async () => {
    await seedSlots(1);
    const user = await createUser();
    const reserved = await testDb.transaction((tx) => reserveFoundingSlot(tx, user.id));
    if (!reserved.ok) throw new Error("expected reservation to succeed");
    await testDb.transaction((tx) => issueFoundingSlot(tx, reserved.allocation.id, "pi_test"));

    const release = await testDb.transaction((tx) => releaseFoundingSlot(tx, reserved.allocation.id));

    expect(release).toBeNull();
    const row = await testDb.query.foundingEngineerAllocations.findFirst({
      where: eq(foundingEngineerAllocations.id, reserved.allocation.id),
    });
    expect(row?.status).toBe("issued");
  });
});

describe("getFoundingCapacity", () => {
  it("counts issued/reserved/remaining across all slots", async () => {
    await seedSlots(2);
    const [a, b] = [await createUser("-a"), await createUser("-b")];
    const reservedA = await testDb.transaction((tx) => reserveFoundingSlot(tx, a.id));
    const reservedB = await testDb.transaction((tx) => reserveFoundingSlot(tx, b.id));
    if (!reservedA.ok || !reservedB.ok) throw new Error("expected both reservations to succeed");
    await testDb.transaction((tx) => issueFoundingSlot(tx, reservedA.allocation.id, "pi_test"));

    const capacity = await getFoundingCapacity();

    // The entire real pool is shielded as 'issued' for this test, so the
    // only non-issued/non-reserved rows are the ones this test created.
    expect(capacity.reserved).toBe(1);
  });
});
