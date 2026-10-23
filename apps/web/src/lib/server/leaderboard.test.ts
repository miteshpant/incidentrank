import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { attempts, scenarios, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { getPaymentRetryStormLeaderboard } from "./leaderboard";

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_IDS = [
  "test-lb-visible-high",
  "test-lb-visible-low",
  "test-lb-visible-tiebreak-a",
  "test-lb-visible-tiebreak-b",
  "test-lb-private",
];

async function cleanupTestUsers() {
  await testDb.delete(users).where(inArray(users.authProviderId, TEST_AUTH_IDS));
}

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = paymentRetryStorm.version;
});

afterEach(async () => {
  await cleanupTestUsers();
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(authProviderId: string, displayName: string, leaderboardVisible: boolean) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId, displayName, leaderboardVisible })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createResolvedAttempt(
  userId: string,
  score: number,
  recoveryTimeMs: number,
  revenueLossUsd: number,
  completedAt: Date,
) {
  await testDb.insert(attempts).values({
    userId,
    scenarioId,
    scenarioVersion,
    attemptType: "practice",
    status: "completed",
    outcome: "resolved",
    score,
    recoveryTimeMs,
    revenueLossUsd,
    completedAt,
  });
}

describe("getPaymentRetryStormLeaderboard", () => {
  it("includes only public, resolved, practice attempts", async () => {
    const visible = await createUser("test-lb-visible-high", "Visible Engineer", true);
    const privateUser = await createUser("test-lb-private", "Private Engineer", false);

    await createResolvedAttempt(visible.id, 900, 150_000, 20_000, new Date("2026-01-01"));
    await createResolvedAttempt(privateUser.id, 950, 100_000, 10_000, new Date("2026-01-01"));

    const entries = await getPaymentRetryStormLeaderboard();
    const names = entries.map((e) => e.displayName);

    expect(names).toContain("Visible Engineer");
    expect(names).not.toContain("Private Engineer");
  });

  it("uses only each user's single best attempt", async () => {
    const user = await createUser("test-lb-visible-high", "Repeat Engineer", true);

    await createResolvedAttempt(user.id, 700, 300_000, 40_000, new Date("2026-01-01"));
    await createResolvedAttempt(user.id, 950, 150_000, 20_000, new Date("2026-01-02"));
    await createResolvedAttempt(user.id, 800, 200_000, 30_000, new Date("2026-01-03"));

    const entries = await getPaymentRetryStormLeaderboard();
    const matches = entries.filter((e) => e.displayName === "Repeat Engineer");

    expect(matches).toHaveLength(1);
    expect(matches[0]?.score).toBe(950);
  });

  it("orders by score descending, then recovery time ascending as a tie-break", async () => {
    const userA = await createUser(
      "test-lb-visible-tiebreak-a",
      "Tiebreak A",
      true,
    );
    const userB = await createUser(
      "test-lb-visible-tiebreak-b",
      "Tiebreak B",
      true,
    );

    // Same score, A recovers faster — A should rank above B.
    await createResolvedAttempt(userA.id, 900, 120_000, 20_000, new Date("2026-01-01"));
    await createResolvedAttempt(userB.id, 900, 180_000, 20_000, new Date("2026-01-01"));

    const entries = await getPaymentRetryStormLeaderboard();
    const aIndex = entries.findIndex((e) => e.displayName === "Tiebreak A");
    const bIndex = entries.findIndex((e) => e.displayName === "Tiebreak B");

    expect(aIndex).toBeGreaterThanOrEqual(0);
    expect(bIndex).toBeGreaterThanOrEqual(0);
    expect(aIndex).toBeLessThan(bIndex);
  });

  it("excludes a user once they disable leaderboard visibility", async () => {
    const user = await createUser("test-lb-visible-high", "Toggling Engineer", true);
    await createResolvedAttempt(user.id, 900, 150_000, 20_000, new Date("2026-01-01"));

    let entries = await getPaymentRetryStormLeaderboard();
    expect(entries.map((e) => e.displayName)).toContain("Toggling Engineer");

    await testDb
      .update(users)
      .set({ leaderboardVisible: false })
      .where(eq(users.id, user.id));

    entries = await getPaymentRetryStormLeaderboard();
    expect(entries.map((e) => e.displayName)).not.toContain("Toggling Engineer");
  });
});
