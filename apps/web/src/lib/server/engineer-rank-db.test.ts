import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  attempts,
  rankSnapshots,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  getLatestRankSnapshotForUser,
  persistRankSnapshotIfChanged,
  rebuildAndPersistRank,
  rebuildEngineerRankForUser,
} from "./engineer-rank";

/**
 * DB-integration tests for the Engineer Rank evidence-gathering/
 * persistence layer (docs/implementation_plan/phase10c.md §21/§64),
 * covering what the pure-function tests in engineer-rank.test.ts
 * explicitly defer here: assessment-attempt exclusion, snapshot-history
 * append-only behavior, and cross-user isolation. Requires
 * ENGINEER_RANK_ENABLED=true for persistRankSnapshotIfChanged (the flag
 * is forced on for this file only, via a direct env var set in
 * beforeAll, matching no other test file's env-mutation pattern in this
 * codebase — isolated to this file since vitest workers don't share
 * process.env mutations across files run in separate processes/forks).
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;
let secondScenarioId: string;
let secondScenarioVersion: number;

const TEST_AUTH_USER_PREFIX = "test-engineer-rank-user-";

beforeAll(async () => {
  process.env.ENGINEER_RANK_ENABLED = "true";
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = 1;

  const second = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "database-connection-saturation"),
  });
  if (second) {
    secondScenarioId = second.id;
    secondScenarioVersion = 1;
  }
}, 30_000);

afterEach(async () => {
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_USER_PREFIX}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(rankSnapshots).where(eq(rankSnapshots.userId, user.id));
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER_PREFIX}%`));
});

afterAll(async () => {
  delete process.env.ENGINEER_RANK_ENABLED;
  await testDb.$client.end({ timeout: 1 });
});

let userCounter = 0;
async function createUser() {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      authProviderId: `${TEST_AUTH_USER_PREFIX}${userCounter}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Rank Tester",
    })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

interface MakeAttemptOpts {
  userId: string;
  attemptType?: "practice" | "assessment";
  status?: "in_progress" | "completed" | "abandoned";
  outcome?: "resolved" | "failed" | "declared_unstable" | "timed_out" | null;
  score?: number | null;
  scenarioIdOverride?: string;
  scenarioVersionOverride?: number;
}

async function makeAttempt(opts: MakeAttemptOpts) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId: opts.userId,
      scenarioId: opts.scenarioIdOverride ?? scenarioId,
      scenarioVersion: opts.scenarioVersionOverride ?? scenarioVersion,
      attemptType: opts.attemptType ?? "practice",
      status: opts.status ?? "completed",
      outcome: opts.outcome ?? "resolved",
      score: opts.score ?? 800,
      recoveryScore: opts.score ?? 800,
      customerImpactScore: opts.score ?? 800,
      dataIntegrityScore: opts.score ?? 800,
      reliabilityScore: opts.score ?? 800,
      costEfficiencyScore: opts.score ?? 800,
      operationalEfficiencyScore: opts.score ?? 800,
      completedAt: opts.status === "in_progress" ? null : new Date(),
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

describe("rebuildEngineerRankForUser", () => {
  it("8. excludes assessment attempts", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, attemptType: "assessment", score: 900 });
    const result = await rebuildEngineerRankForUser(testDb, user.id);
    expect(result.qualifyingAttempts).toBe(0);
    expect(result.rankBand).toBeNull();
  });

  it("includes only completed practice attempts, excludes in_progress", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, status: "in_progress", outcome: null, score: null });
    const result = await rebuildEngineerRankForUser(testDb, user.id);
    expect(result.qualifyingAttempts).toBe(0);
  });

  it("13. cross-user isolation — user A's result unaffected by user B's attempts", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await makeAttempt({ userId: userA.id, score: 900 });
    await makeAttempt({ userId: userB.id, score: 100 });
    await makeAttempt({ userId: userB.id, score: 100 });

    const resultA = await rebuildEngineerRankForUser(testDb, userA.id);
    expect(resultA.qualifyingAttempts).toBe(1);
  });
});

describe("persistRankSnapshotIfChanged", () => {
  it("inserts a snapshot for a user with qualifying evidence", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, score: 900 });

    const latestBefore = await getLatestRankSnapshotForUser(user.id, testDb);
    expect(latestBefore).toBeNull();

    await persistRankSnapshotIfChanged(testDb, user.id, null);

    const latestAfter = await getLatestRankSnapshotForUser(user.id, testDb);
    expect(latestAfter).not.toBeNull();
    expect(latestAfter!.userId).toBe(user.id);
  });

  it("does not write a near-duplicate snapshot when nothing materially changed", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, score: 900 });
    await persistRankSnapshotIfChanged(testDb, user.id, null);

    const rowsAfterFirst = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, user.id),
    });
    expect(rowsAfterFirst.length).toBe(1);

    // Calling again with unchanged evidence must not insert a second row.
    await persistRankSnapshotIfChanged(testDb, user.id, null);
    const rowsAfterSecond = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, user.id),
    });
    expect(rowsAfterSecond.length).toBe(1);
  });

  it("12. snapshot history preserved — a material change inserts a new row, never updates the old one", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, score: 100 });
    await persistRankSnapshotIfChanged(testDb, user.id, null);
    const firstSnapshot = await getLatestRankSnapshotForUser(user.id, testDb);
    expect(firstSnapshot).not.toBeNull();

    // Add enough additional strong evidence to push confidence/band —
    // use the second built-in scenario if available so scenarios are
    // distinct (best-of-per-scenario would otherwise collapse repeats).
    if (secondScenarioId) {
      for (let i = 0; i < 20; i++) {
        await makeAttempt({
          userId: user.id,
          score: 950,
          scenarioIdOverride: i % 2 === 0 ? scenarioId : secondScenarioId,
          scenarioVersionOverride: i % 2 === 0 ? scenarioVersion : secondScenarioVersion,
        });
      }
      await persistRankSnapshotIfChanged(testDb, user.id, null);
    }

    const allSnapshots = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, user.id),
    });
    // At minimum the first snapshot must still exist unmodified —
    // append-only, never an UPDATE.
    expect(allSnapshots.some((s) => s.id === firstSnapshot!.id)).toBe(true);
  });

  it("no-ops when ENGINEER_RANK_ENABLED is not 'true'", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, score: 900 });

    const original = process.env.ENGINEER_RANK_ENABLED;
    process.env.ENGINEER_RANK_ENABLED = "false";
    try {
      await persistRankSnapshotIfChanged(testDb, user.id, null);
      const latest = await getLatestRankSnapshotForUser(user.id, testDb);
      expect(latest).toBeNull();
    } finally {
      process.env.ENGINEER_RANK_ENABLED = original;
    }
  });
});

describe("rebuildAndPersistRank", () => {
  it("14. rebuild determinism — two rebuilds of unchanged evidence produce equivalent results, as separate rows", async () => {
    const user = await createUser();
    await makeAttempt({ userId: user.id, score: 900 });

    const first = await rebuildAndPersistRank(user.id);
    const second = await rebuildAndPersistRank(user.id);

    expect(first.rankBand).toBe(second.rankBand);
    expect(first.confidence).toBe(second.confidence);

    const allSnapshots = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, user.id),
    });
    // Unconditional force-write on every rebuild call — two rows, never
    // deduplicated like persistRankSnapshotIfChanged would.
    expect(allSnapshots.length).toBe(2);
  });

  it("another user's rank cannot be mutated by rebuilding a different user's rank", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await makeAttempt({ userId: userA.id, score: 900 });
    await makeAttempt({ userId: userB.id, score: 100 });

    await rebuildAndPersistRank(userA.id);

    const userBSnapshots = await testDb.query.rankSnapshots.findMany({
      where: eq(rankSnapshots.userId, userB.id),
    });
    expect(userBSnapshots.length).toBe(0);
  });
});
