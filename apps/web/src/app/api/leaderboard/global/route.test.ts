import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { rankSnapshots, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { GET } from "./route";

/**
 * Public-enumeration regression test (phasse10d.md §67/§68): the public
 * leaderboard HTTP route — not just the underlying getGlobalLeaderboard()
 * function, already covered by global-leaderboard.test.ts — must never
 * leak an opted-out user via its JSON response, and the response shape
 * itself must never include a field beyond the allowlisted public set
 * (no userId, no email, no raw DB row passthrough).
 */

let testDb: Db;

const TEST_AUTH_IDS = ["test-leaderboard-route-opted-out", "test-leaderboard-route-opted-in"];

async function cleanupTestUsers() {
  const testUsers = await testDb.query.users.findMany({
    where: inArray(users.authProviderId, TEST_AUTH_IDS),
  });
  for (const user of testUsers) {
    await testDb.delete(rankSnapshots).where(eq(rankSnapshots.userId, user.id));
  }
  await testDb.delete(users).where(inArray(users.authProviderId, TEST_AUTH_IDS));
}

beforeAll(() => {
  process.env.ENGINEER_RANK_ENABLED = "true";
  testDb = createDb();
});

afterEach(async () => {
  await cleanupTestUsers();
});

afterAll(async () => {
  delete process.env.ENGINEER_RANK_ENABLED;
  await testDb.$client.end({ timeout: 1 });
});

describe("GET /api/leaderboard/global — public enumeration regression", () => {
  it("1. an opted-out user with a strong rank never appears in the public JSON response", async () => {
    const [optedOut] = await testDb
      .insert(users)
      .values({
        authProviderId: "test-leaderboard-route-opted-out",
        displayName: "Route Opted Out",
        leaderboardVisible: false,
      })
      .returning();
    if (!optedOut) throw new Error("user not created");
    await testDb.insert(rankSnapshots).values({
      userId: optedOut.id,
      algorithmVersion: "v1",
      rankBand: "principal",
      provisional: false,
      confidence: "high",
      normalizedScore: 1.55,
      dimensionScoresJson: {},
      skillScoresJson: {},
      attemptsCount: 20,
      qualifyingAttempts: 20,
      evidenceBreadth: 20,
      distinctSkillAreas: 4,
    });

    const response = await GET();
    const body = (await response.json()) as { entries: Array<{ displayName: string }> };
    expect(body.entries.map((e) => e.displayName)).not.toContain("Route Opted Out");
  });

  it("2. the response shape is exactly the allowlisted public fields — no userId, no raw row", async () => {
    const [optedIn] = await testDb
      .insert(users)
      .values({
        authProviderId: "test-leaderboard-route-opted-in",
        displayName: "Route Opted In",
        leaderboardVisible: true,
      })
      .returning();
    if (!optedIn) throw new Error("user not created");
    await testDb.insert(rankSnapshots).values({
      userId: optedIn.id,
      algorithmVersion: "v1",
      rankBand: "senior",
      provisional: false,
      confidence: "medium",
      normalizedScore: 0.65,
      dimensionScoresJson: {},
      skillScoresJson: {},
      attemptsCount: 8,
      qualifyingAttempts: 8,
      evidenceBreadth: 8,
      distinctSkillAreas: 3,
    });

    const response = await GET();
    const body = (await response.json()) as { entries: Array<Record<string, unknown>> };
    const entry = body.entries.find((e) => e.displayName === "Route Opted In");
    expect(entry).toBeDefined();
    expect(Object.keys(entry!).sort()).toEqual(
      ["confidence", "displayName", "evidenceBreadth", "normalizedScore", "qualifyingAttempts", "rank", "rankBand"].sort(),
    );
    expect(entry).not.toHaveProperty("userId");
  });
});
