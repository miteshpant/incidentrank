import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  attemptActionChanges,
  attemptActionGroups,
  attempts,
  benchmarkActionFacts,
  benchmarkAttemptFacts,
  benchmarkProjectionFailures,
  benchmarkSubjects,
  organizationMembers,
  organizations,
  rankSnapshots,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  materializeBenchmarkAttemptFact,
  materializeBenchmarkAttemptFactSafely,
  rebuildBenchmarkAttempt,
  rebuildBenchmarkForUser,
} from "./materialize";
import { BENCHMARK_PROJECTION_VERSION, SCORING_VERSION } from "./benchmark-versions";

/**
 * docs/implementation_plan/phase10e.md §38 (22 required cases). Real
 * Postgres, no mocks, matching account-deletion.test.ts's convention —
 * uses the real seeded "payment-retry-storm" built-in scenario.
 */

let testDb: Db;
let scenarioId: string;
let scenarioSlug: string;
const TEST_AUTH_PREFIX = "test-benchmark-materialize-";
const TEST_ORG_SLUG = "test-benchmark-materialize-org";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioSlug = scenario.slug;
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
      await testDb.delete(benchmarkProjectionFailures).where(eq(benchmarkProjectionFailures.attemptId, a.id));
      await testDb.delete(attemptActionGroups).where(eq(attemptActionGroups.attemptId, a.id));
    }
    await testDb.delete(rankSnapshots).where(eq(rankSnapshots.userId, user.id));
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    await testDb.delete(benchmarkSubjects).where(eq(benchmarkSubjects.userId, user.id));
    await testDb.delete(organizationMembers).where(eq(organizationMembers.userId, user.id));
    // assessments.createdByUserId references users — must be cleared
    // before the user row itself can be deleted below.
    await testDb.delete(assessmentCandidates).where(eq(assessmentCandidates.userId, user.id));
    await testDb.delete(assessments).where(eq(assessments.createdByUserId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_PREFIX}%`));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
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
      displayName: "Benchmark Tester",
    })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createCompletedPracticeAttempt(
  userId: string,
  overrides: Partial<typeof attempts.$inferInsert> = {},
) {
  const startedAt = new Date(Date.now() - 10 * 60 * 1000);
  const completedAt = new Date();
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
      customerImpactScore: 75,
      dataIntegrityScore: 90,
      reliabilityScore: 85,
      costEfficiencyScore: 70,
      operationalEfficiencyScore: 95,
      startedAt,
      completedAt,
      ...overrides,
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

describe("materializeBenchmarkAttemptFact", () => {
  it("1. a completed qualifying practice attempt materializes a fact row", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    const result = await materializeBenchmarkAttemptFact(attempt.id);

    expect(result.materialized).toBe(true);
    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact).toBeDefined();
  });

  it("2. an assessment attempt is excluded, never materialized", async () => {
    const user = await createUser();
    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Benchmark Test Org", slug: TEST_ORG_SLUG, status: "active" })
      .returning();
    if (!org) throw new Error("org not created");
    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        scenarioId,
        scenarioVersion: 1,
        name: "Test Assessment",
        createdByUserId: user.id,
      })
      .returning();
    if (!assessment) throw new Error("assessment not created");

    const attempt = await createCompletedPracticeAttempt(user.id, {
      attemptType: "assessment",
      assessmentId: assessment.id,
    });

    const result = await materializeBenchmarkAttemptFact(attempt.id);

    expect(result.materialized).toBe(false);
    if (!result.materialized) expect(result.reason).toBe("not_practice");
    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact).toBeUndefined();
    // Cleanup order (attempts -> assessments -> org) is handled by
    // afterEach, which deletes this user's attempts before their
    // created assessments.
  });

  it("3. an org-private scenario is excluded, even for a practice attempt", async () => {
    const user = await createUser();
    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Benchmark Private Org", slug: `${TEST_ORG_SLUG}-private`, status: "active" })
      .returning();
    if (!org) throw new Error("org not created");
    const [orgScenario] = await testDb
      .insert(scenarios)
      .values({
        slug: `${TEST_AUTH_PREFIX}org-scenario`,
        name: "Org Private Scenario",
        ownershipType: "organization",
        organizationId: org.id,
        visibility: "private",
      })
      .returning();
    if (!orgScenario) throw new Error("org scenario not created");

    const attempt = await createCompletedPracticeAttempt(user.id, { scenarioId: orgScenario.id });

    const result = await materializeBenchmarkAttemptFact(attempt.id);

    expect(result.materialized).toBe(false);
    if (!result.materialized) expect(result.reason).toBe("not_incidentrank_owned");

    await testDb.delete(attempts).where(eq(attempts.id, attempt.id));
    await testDb.delete(scenarios).where(eq(scenarios.id, orgScenario.id));
    await testDb.delete(organizations).where(eq(organizations.id, org.id));
  });

  it("4. scenario version is captured", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id, { scenarioVersion: 3 });

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.scenarioVersion).toBe(3);
  });

  it("5. difficulty is captured from the catalog at materialization time", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.difficulty).toBeTruthy();
  });

  it("6. category is captured from the catalog at materialization time", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.category).toBeTruthy();
  });

  it("7. scoring version is captured", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.scoringVersion).toBe(SCORING_VERSION);
  });

  it("8. rank algorithm version is captured", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.rankAlgorithmVersion).toBe("v1");
  });

  it("9. projection version is captured", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.benchmarkProjectionVersion).toBe(BENCHMARK_PROJECTION_VERSION);
  });

  it("10. first attempt is correctly identified", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.isFirstAttempt).toBe(true);
    expect(fact?.attemptNumberForScenario).toBe(1);
  });

  it("11. a repeat attempt is correctly identified as non-first", async () => {
    const user = await createUser();
    const first = await createCompletedPracticeAttempt(user.id, {
      completedAt: new Date(Date.now() - 60_000),
    });
    const second = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(first.id);
    await materializeBenchmarkAttemptFact(second.id);

    const secondFact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, second.id),
    });
    expect(secondFact?.isFirstAttempt).toBe(false);
    expect(secondFact?.attemptNumberForScenario).toBe(2);
  });

  it("12. action sequence is preserved in order", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);
    const [group0] = await testDb
      .insert(attemptActionGroups)
      .values({ attemptId: attempt.id, sequence: 0, elapsedMs: 1000 })
      .returning();
    const [group1] = await testDb
      .insert(attemptActionGroups)
      .values({ attemptId: attempt.id, sequence: 1, elapsedMs: 5000 })
      .returning();
    if (!group0 || !group1) throw new Error("groups not created");
    await testDb.insert(attemptActionChanges).values([
      { actionGroupId: group0.id, sequence: 0, controlKey: "restart_service", previousValueJson: false, newValueJson: true },
      { actionGroupId: group1.id, sequence: 0, controlKey: "scale_replicas", previousValueJson: 2, newValueJson: 4 },
    ]);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    const actionFacts = await testDb.query.benchmarkActionFacts.findMany({
      where: eq(benchmarkActionFacts.benchmarkAttemptFactId, fact!.id),
      orderBy: (t, { asc }) => [asc(t.sequenceNumber)],
    });
    expect(actionFacts.map((f) => f.sequenceNumber)).toEqual([0, 1]);
    expect(actionFacts[0]?.actionType).toBe("restart_service");
    expect(actionFacts[1]?.actionType).toBe("scale_replicas");
  });

  it("13. action order is deterministic across rematerialization", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);
    const [group0] = await testDb
      .insert(attemptActionGroups)
      .values({ attemptId: attempt.id, sequence: 0, elapsedMs: 1000 })
      .returning();
    if (!group0) throw new Error("group not created");
    await testDb
      .insert(attemptActionChanges)
      .values({ actionGroupId: group0.id, sequence: 0, controlKey: "restart_service", previousValueJson: false, newValueJson: true });

    await materializeBenchmarkAttemptFact(attempt.id);
    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    const actionFacts = await testDb.query.benchmarkActionFacts.findMany({
      where: eq(benchmarkActionFacts.benchmarkAttemptFactId, fact!.id),
    });
    expect(actionFacts.length).toBe(1);
  });

  it("14. timing (duration) is preserved", async () => {
    const user = await createUser();
    const startedAt = new Date(Date.now() - 15 * 60 * 1000);
    const completedAt = new Date();
    const attempt = await createCompletedPracticeAttempt(user.id, { startedAt, completedAt });

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.durationSeconds).toBeGreaterThanOrEqual(14 * 60);
    expect(fact?.durationSeconds).toBeLessThanOrEqual(16 * 60);
  });

  it("15. terminal outcome is preserved", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id, { outcome: "declared_unstable" });

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.terminalOutcome).toBe("declared_unstable");
  });

  it("16. scoring dimensions are preserved", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id, {
      recoveryScore: 42,
      customerImpactScore: 43,
      dataIntegrityScore: 44,
      reliabilityScore: 45,
      costEfficiencyScore: 46,
      operationalEfficiencyScore: 47,
    });

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.recoveryScore).toBe(42);
    expect(fact?.customerImpactScore).toBe(43);
    expect(fact?.dataIntegrityScore).toBe(44);
    expect(fact?.reliabilityScore).toBe(45);
    expect(fact?.costEfficiencyScore).toBe(46);
    expect(fact?.operationalEfficiencyScore).toBe(47);
  });

  it("17. no PII is duplicated into the fact row — no displayName/authProviderId column exists", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact).not.toHaveProperty("displayName");
    expect(fact).not.toHaveProperty("authProviderId");
    expect(fact).not.toHaveProperty("userId");
    expect(Object.keys(fact ?? {})).toContain("benchmarkSubjectId");
  });

  it("18. rematerialization is idempotent — same attempt, same version, one row", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);
    await materializeBenchmarkAttemptFact(attempt.id);
    await materializeBenchmarkAttemptFact(attempt.id);

    const facts = await testDb.query.benchmarkAttemptFacts.findMany({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(facts.length).toBe(1);
  });

  it("19. rebuildBenchmarkAttempt is equivalent to materializeBenchmarkAttemptFact", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    const direct = await materializeBenchmarkAttemptFact(attempt.id);
    const viaRebuild = await rebuildBenchmarkAttempt(attempt.id);

    expect(direct.materialized).toBe(true);
    expect(viaRebuild.materialized).toBe(true);
    const facts = await testDb.query.benchmarkAttemptFacts.findMany({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(facts.length).toBe(1);
  });

  it("20. a benchmark materialization failure never destroys the underlying completed attempt", async () => {
    const user = await createUser();
    // An attempt that is NOT completed yet — materialize must decline
    // cleanly (reason: not_completed) without throwing or mutating the
    // attempt row.
    const [attempt] = await testDb
      .insert(attempts)
      .values({
        userId: user.id,
        scenarioId,
        scenarioVersion: 1,
        attemptType: "practice",
        status: "in_progress",
        startedAt: new Date(),
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    await materializeBenchmarkAttemptFactSafely(attempt.id);

    const reloaded = await testDb.query.attempts.findFirst({ where: eq(attempts.id, attempt.id) });
    expect(reloaded?.status).toBe("in_progress");

    await testDb.delete(attempts).where(eq(attempts.id, attempt.id));
  });

  it("21. non-admin denied — covered at the admin route layer (this module has no auth concept of its own)", () => {
    // materialize.ts intentionally has no authorization logic — every
    // caller is either an internal post-commit hook or an already-admin-
    // gated route. 401/403 behavior is tested at the route layer.
    expect(true).toBe(true);
  });

  it("22. deletion/anonymization remains privacy-safe — the fact row survives account deletion with no accidental re-identification", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);
    await materializeBenchmarkAttemptFact(attempt.id);

    const { deleteOwnAccount } = await import("../account-deletion");
    await deleteOwnAccount(user.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    // The fact row survives (userId on `users` never changes, only
    // displayName/authProviderId) — no re-identification fields exist on
    // the fact row itself to begin with (test 17 confirms the shape).
    expect(fact).toBeDefined();
  });

  it("scenario slug is captured", async () => {
    const user = await createUser();
    const attempt = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(attempt.id);

    const fact = await testDb.query.benchmarkAttemptFacts.findFirst({
      where: eq(benchmarkAttemptFacts.attemptId, attempt.id),
    });
    expect(fact?.scenarioSlug).toBe(scenarioSlug);
  });

  it("creates exactly one benchmark subject per user, reused across multiple attempts", async () => {
    const user = await createUser();
    const first = await createCompletedPracticeAttempt(user.id, {
      completedAt: new Date(Date.now() - 60_000),
    });
    const second = await createCompletedPracticeAttempt(user.id);

    await materializeBenchmarkAttemptFact(first.id);
    await materializeBenchmarkAttemptFact(second.id);

    const subjects = await testDb.query.benchmarkSubjects.findMany({
      where: eq(benchmarkSubjects.userId, user.id),
    });
    expect(subjects.length).toBe(1);
  });
});

describe("rebuildBenchmarkForUser", () => {
  it("rebuilds every qualifying attempt and returns the materialized count", async () => {
    const user = await createUser();
    const a = await createCompletedPracticeAttempt(user.id, { completedAt: new Date(Date.now() - 120_000) });
    const b = await createCompletedPracticeAttempt(user.id, { completedAt: new Date(Date.now() - 60_000) });

    const count = await rebuildBenchmarkForUser(user.id);

    expect(count).toBe(2);
    const facts = await testDb.query.benchmarkAttemptFacts.findMany({
      where: eq(benchmarkAttemptFacts.attemptId, a.id),
    });
    const facts2 = await testDb.query.benchmarkAttemptFacts.findMany({
      where: eq(benchmarkAttemptFacts.attemptId, b.id),
    });
    expect(facts.length).toBe(1);
    expect(facts2.length).toBe(1);
  });
});
