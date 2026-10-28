import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { rankSnapshots, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { getGlobalLeaderboard } from "./global-leaderboard";

/**
 * Global leaderboard tests (new scope beyond spec §21/§64, added for the
 * user-requested global leaderboard replacing the old single-scenario
 * one — see docs/implementation_plan/phase10c.md plan file's "Global
 * Engineer Rank Leaderboard" section). Mirrors the removed
 * leaderboard.test.ts's fixture style.
 */

let testDb: Db;

const TEST_AUTH_IDS = [
  "test-glb-opted-in-principal",
  "test-glb-opted-in-staff-high-score",
  "test-glb-opted-in-staff-low-score",
  "test-glb-opted-out",
  "test-glb-no-snapshot",
];

async function cleanupTestUsers() {
  const testUsers = await testDb.query.users.findMany({
    where: inArray(users.authProviderId, TEST_AUTH_IDS),
  });
  for (const user of testUsers) {
    await testDb.delete(rankSnapshots).where(eq(rankSnapshots.userId, user.id));
  }
  await testDb.delete(users).where(inArray(users.authProviderId, TEST_AUTH_IDS));
}

beforeAll(async () => {
  testDb = createDb();
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

async function createSnapshot(
  userId: string,
  rankBand: "developing" | "intermediate" | "senior" | "staff" | "senior_staff" | "principal",
  normalizedScore: number,
  qualifyingAttempts = 5,
) {
  await testDb.insert(rankSnapshots).values({
    userId,
    algorithmVersion: "v1",
    rankBand,
    provisional: false,
    confidence: "medium",
    normalizedScore,
    dimensionScoresJson: {},
    skillScoresJson: {},
    attemptsCount: qualifyingAttempts,
    qualifyingAttempts,
    evidenceBreadth: qualifyingAttempts,
    distinctSkillAreas: 3,
  });
}

describe("getGlobalLeaderboard", () => {
  it("excludes a user who has never opted in, regardless of rank strength", async () => {
    const optedOut = await createUser("test-glb-opted-out", "Opted Out Engineer", false);
    await createSnapshot(optedOut.id, "principal", 1.5);

    const entries = await getGlobalLeaderboard();
    expect(entries.map((e) => e.displayName)).not.toContain("Opted Out Engineer");
  });

  it("includes an opted-in user with exactly the public fields, nothing more", async () => {
    const user = await createUser("test-glb-opted-in-principal", "Public Engineer", true);
    await createSnapshot(user.id, "staff", 0.8, 12);

    const entries = await getGlobalLeaderboard();
    const entry = entries.find((e) => e.displayName === "Public Engineer");
    expect(entry).toBeDefined();
    expect(Object.keys(entry!).sort()).toEqual(
      ["confidence", "displayName", "evidenceBreadth", "normalizedScore", "qualifyingAttempts", "rankBand", "userId"].sort(),
    );
  });

  it("sorts band-first — a lower-score Principal still outranks a higher-score Staff", async () => {
    const principalUser = await createUser("test-glb-opted-in-principal", "Principal Engineer", true);
    const staffUser = await createUser("test-glb-opted-in-staff-high-score", "Staff Engineer", true);

    await createSnapshot(principalUser.id, "principal", 1.2); // lower score
    await createSnapshot(staffUser.id, "staff", 0.9); // higher score within its own band's range

    const entries = await getGlobalLeaderboard();
    const principalIndex = entries.findIndex((e) => e.displayName === "Principal Engineer");
    const staffIndex = entries.findIndex((e) => e.displayName === "Staff Engineer");

    expect(principalIndex).toBeGreaterThanOrEqual(0);
    expect(staffIndex).toBeGreaterThanOrEqual(0);
    expect(principalIndex).toBeLessThan(staffIndex);
  });

  it("within-band tiebreak is normalizedScore descending", async () => {
    const higherScore = await createUser("test-glb-opted-in-staff-high-score", "Higher Score Staff", true);
    const lowerScore = await createUser("test-glb-opted-in-staff-low-score", "Lower Score Staff", true);

    await createSnapshot(higherScore.id, "staff", 0.9);
    await createSnapshot(lowerScore.id, "staff", 0.8);

    const entries = await getGlobalLeaderboard();
    const higherIndex = entries.findIndex((e) => e.displayName === "Higher Score Staff");
    const lowerIndex = entries.findIndex((e) => e.displayName === "Lower Score Staff");

    expect(higherIndex).toBeLessThan(lowerIndex);
  });

  it("a user with no snapshot never appears even if opted in", async () => {
    const user = await createUser("test-glb-no-snapshot", "No Snapshot Engineer", true);
    void user;

    const entries = await getGlobalLeaderboard();
    expect(entries.map((e) => e.displayName)).not.toContain("No Snapshot Engineer");
  });

  it("qualifyingAttempts matches the latest snapshot's count, reflecting the best-of-per-scenario collapse upstream", async () => {
    const user = await createUser("test-glb-opted-in-principal", "Count Engineer", true);
    await createSnapshot(user.id, "senior", 0.65, 8);

    const entries = await getGlobalLeaderboard();
    const entry = entries.find((e) => e.displayName === "Count Engineer");
    expect(entry?.qualifyingAttempts).toBe(8);
  });

  it("uses only each user's LATEST snapshot, not an earlier weaker one", async () => {
    const user = await createUser("test-glb-opted-in-principal", "Progressing Engineer", true);
    await createSnapshot(user.id, "developing", 0.1, 1);
    await createSnapshot(user.id, "staff", 0.85, 10);

    const entries = await getGlobalLeaderboard();
    const entry = entries.find((e) => e.displayName === "Progressing Engineer");
    expect(entry?.rankBand).toBe("staff");
  });
});
