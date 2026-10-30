import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  attemptActionChanges,
  attemptActionGroups,
  attempts,
  benchmarkActionFacts,
  benchmarkAttemptFacts,
  benchmarkSubjects,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { materializeBenchmarkAttemptFact } from "./materialize";
import {
  calibrateDecisionPatterns,
  calibrateScenario,
  getBenchmarkOverallMetrics,
} from "./calibration";
import { sampleQualityFor } from "./sample-quality";

let testDb: Db;
let scenarioId: string;
const TEST_AUTH_PREFIX = "test-benchmark-calibration-";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
});

afterEach(async () => {
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_PREFIX}%`),
  });
  for (const user of testUsers) {
    const userAttempts = await testDb.query.attempts.findMany({
      where: eq(attempts.userId, user.id),
      columns: { id: true },
    });
    for (const a of userAttempts) {
      const facts = await testDb.query.benchmarkAttemptFacts.findMany({
        where: eq(benchmarkAttemptFacts.attemptId, a.id),
        columns: { id: true },
      });
      for (const f of facts) {
        await testDb.delete(benchmarkActionFacts).where(eq(benchmarkActionFacts.benchmarkAttemptFactId, f.id));
      }
      await testDb.delete(benchmarkAttemptFacts).where(eq(benchmarkAttemptFacts.attemptId, a.id));
      await testDb.delete(attemptActionGroups).where(eq(attemptActionGroups.attemptId, a.id));
    }
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    await testDb.delete(benchmarkSubjects).where(eq(benchmarkSubjects.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_PREFIX}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let userCounter = 0;
async function createUser() {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      authProviderId: `${TEST_AUTH_PREFIX}${userCounter}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Calibration Tester",
    })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createMaterializedAttempt(
  userId: string,
  overrides: Partial<typeof attempts.$inferInsert> = {},
  firstActionControlKey?: string,
) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId,
      scenarioId,
      scenarioVersion: 1,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      score: 800,
      recoveryScore: 80,
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
      completedAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");

  if (firstActionControlKey) {
    const [group] = await testDb
      .insert(attemptActionGroups)
      .values({ attemptId: attempt.id, sequence: 0, elapsedMs: 1000 })
      .returning();
    if (!group) throw new Error("group not created");
    await testDb.insert(attemptActionChanges).values({
      actionGroupId: group.id,
      sequence: 0,
      controlKey: firstActionControlKey,
      previousValueJson: false,
      newValueJson: true,
    });
  }

  await materializeBenchmarkAttemptFact(attempt.id);
  return attempt;
}

describe("sampleQualityFor", () => {
  it("below 10 is insufficient", () => {
    expect(sampleQualityFor(0)).toBe("insufficient");
    expect(sampleQualityFor(9)).toBe("insufficient");
  });
  it("10-29 is early_signal", () => {
    expect(sampleQualityFor(10)).toBe("early_signal");
    expect(sampleQualityFor(29)).toBe("early_signal");
  });
  it("30+ is usable", () => {
    expect(sampleQualityFor(30)).toBe("usable");
    expect(sampleQualityFor(1000)).toBe("usable");
  });
});

describe("calibrateScenario", () => {
  it("returns null for a scenario with zero benchmark evidence", async () => {
    const result = await calibrateScenario("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("computes resolved/failed percentages and median score across multiple attempts", async () => {
    const user = await createUser();
    await createMaterializedAttempt(user.id, { outcome: "resolved", score: 900 });
    await createMaterializedAttempt(user.id, {
      outcome: "failed",
      score: 100,
      completedAt: new Date(Date.now() - 60_000),
    });

    const calibration = await calibrateScenario(scenarioId);

    expect(calibration).not.toBeNull();
    expect(calibration!.totalAttempts).toBeGreaterThanOrEqual(2);
    expect(calibration!.resolvedPct).toBeGreaterThan(0);
    expect(calibration!.failedPct).toBeGreaterThan(0);
    expect(calibration!.medianScore).not.toBeNull();
  });

  it("sample quality reflects first-attempt count, not total attempts", async () => {
    const user = await createUser();
    await createMaterializedAttempt(user.id);

    const calibration = await calibrateScenario(scenarioId);

    expect(calibration!.sampleQuality).toBe(sampleQualityFor(calibration!.firstAttempts));
  });
});

describe("calibrateDecisionPatterns", () => {
  it("returns empty arrays for a scenario with no action data", async () => {
    const patterns = await calibrateDecisionPatterns("00000000-0000-0000-0000-000000000000");
    expect(patterns.commonFirstActions).toEqual([]);
    expect(patterns.commonActionSequences).toEqual([]);
    expect(patterns.highPerformingFirstActions).toEqual([]);
  });

  it("counts common first actions across attempts", async () => {
    const user = await createUser();
    await createMaterializedAttempt(user.id, {}, "restart_service");
    await createMaterializedAttempt(user.id, { completedAt: new Date(Date.now() - 60_000) }, "restart_service");

    const patterns = await calibrateDecisionPatterns(scenarioId);

    const restartEntry = patterns.commonFirstActions.find((a) => a.actionType === "restart_service");
    expect(restartEntry?.count).toBeGreaterThanOrEqual(2);
  });

  it("never reports a high-performing action with fewer than 3 samples", async () => {
    const user = await createUser();
    await createMaterializedAttempt(user.id, { outcome: "resolved" }, "unique_rare_action");

    const patterns = await calibrateDecisionPatterns(scenarioId);

    expect(patterns.highPerformingFirstActions.find((a) => a.actionType === "unique_rare_action")).toBeUndefined();
  });
});

describe("getBenchmarkOverallMetrics", () => {
  it("counts reflect real materialized facts", async () => {
    const before = await getBenchmarkOverallMetrics();
    const user = await createUser();
    await createMaterializedAttempt(user.id);

    const after = await getBenchmarkOverallMetrics();

    expect(after.qualifyingAttempts).toBe(before.qualifyingAttempts + 1);
    expect(after.benchmarkSubjects).toBeGreaterThanOrEqual(before.benchmarkSubjects);
  });
});
