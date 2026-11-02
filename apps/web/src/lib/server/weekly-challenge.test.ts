import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { scenarios, users, weeklyChallenges, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  activateWeeklyChallenge,
  deactivateWeeklyChallenge,
  getActiveWeeklyChallenge,
  isCurrentWeeklyChallenge,
} from "./weekly-challenge";

/**
 * docs/implementation_plan/phase-challege-version.md §18 — real Postgres,
 * matching this codebase's convention. Uses the real seeded
 * payment-retry-storm/kafka-consumer-lag built-in scenarios (never a
 * throwaway row) since the admin weekly-challenge API only accepts
 * ownershipType="incidentrank" scenarios.
 */
let testDb: Db;
let scenarioAId: string;
let scenarioBId: string;

const TEST_AUTH_ID = "test-weekly-challenge-admin";

beforeAll(async () => {
  testDb = createDb();
  const a = await testDb.query.scenarios.findFirst({ where: eq(scenarios.slug, "payment-retry-storm") });
  const b = await testDb.query.scenarios.findFirst({ where: eq(scenarios.slug, "kafka-consumer-lag") });
  if (!a || !b) throw new Error("seed scenarios missing — run pnpm db:seed");
  scenarioAId = a.id;
  scenarioBId = b.id;
});

afterEach(async () => {
  await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.scenarioId, scenarioAId));
  await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.scenarioId, scenarioBId));
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_ID}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createAdminUser() {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_ID, displayName: "Weekly Challenge Admin" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

describe("activateWeeklyChallenge / deactivateWeeklyChallenge / getActiveWeeklyChallenge", () => {
  it("activating creates an active row referencing the given scenario", async () => {
    const admin = await createAdminUser();

    const created = await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioAId, adminUserId: admin.id }),
    );

    expect(created.active).toBe(true);
    expect(created.scenarioId).toBe(scenarioAId);

    const active = await getActiveWeeklyChallenge();
    expect(active?.id).toBe(created.id);
  });

  it("activating a different scenario replaces the current active challenge (at most one active row)", async () => {
    const admin = await createAdminUser();

    await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioAId, adminUserId: admin.id }),
    );
    const second = await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioBId, adminUserId: admin.id }),
    );

    const activeRows = await testDb.query.weeklyChallenges.findMany({
      where: eq(weeklyChallenges.active, true),
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]?.id).toBe(second.id);
    expect(activeRows[0]?.scenarioId).toBe(scenarioBId);
  });

  it("deactivating clears the active challenge", async () => {
    const admin = await createAdminUser();
    await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioAId, adminUserId: admin.id }),
    );

    await testDb.transaction((tx) => deactivateWeeklyChallenge(tx));

    expect(await getActiveWeeklyChallenge()).toBeNull();
  });

  it("the DB enforces at most one active row even against a direct concurrent-style insert", async () => {
    const admin = await createAdminUser();
    await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioAId, adminUserId: admin.id }),
    );

    await expect(
      testDb.insert(weeklyChallenges).values({
        scenarioId: scenarioBId,
        createdByUserId: admin.id,
        active: true,
      }),
    ).rejects.toThrow();
  });
});

describe("isCurrentWeeklyChallenge", () => {
  it("returns true only for the currently active challenge's scenario", async () => {
    const admin = await createAdminUser();
    await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioAId, adminUserId: admin.id }),
    );

    expect(await isCurrentWeeklyChallenge(scenarioAId)).toBe(true);
    expect(await isCurrentWeeklyChallenge(scenarioBId)).toBe(false);
  });

  it("returns false for every scenario once deactivated", async () => {
    const admin = await createAdminUser();
    await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId: scenarioAId, adminUserId: admin.id }),
    );
    await testDb.transaction((tx) => deactivateWeeklyChallenge(tx));

    expect(await isCurrentWeeklyChallenge(scenarioAId)).toBe(false);
  });
});
