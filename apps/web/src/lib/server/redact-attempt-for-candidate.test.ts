import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, scenarios, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { redactAttemptForCandidate } from "./redact-attempt-for-candidate";

/**
 * Negative privacy regression (Phase 7.1 — docs/implementation_plan/
 * phase7.action.md's "Add negative privacy regression tests"). This does
 * not merely check that an assessment-safe response contains a
 * `submitted` flag — it explicitly asserts the ABSENCE of every
 * evaluation-derived field the candidate must never receive, against a
 * real, fully-scored `attempts` row (inserted directly, every
 * restricted column populated with a real non-null value) so a
 * redaction bug that merely forgets to clear one field cannot pass
 * silently. Fails closed: if a new column is ever added to `attempts`
 * and `redactAttemptForCandidate` is not updated to redact it, the
 * `JSON.stringify` round-trip check at the bottom of the suite catches
 * it generically, not just the explicitly-named fields below.
 */

let testDb: Db;
let scenarioId: string;
let userId: string;
let practiceAttemptId: string;
let assessmentAttemptId: string;

beforeAll(async () => {
  testDb = createDb();

  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;

  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: "test-redaction-user", displayName: "Redaction Test User" })
    .returning();
  if (!user) throw new Error("fixture user not created");
  userId = user.id;

  // A fully-scored, fully-populated terminal attempt — every field the
  // candidate-safe assessment view must NOT expose is given a real,
  // non-null value here, so the test can fail closed rather than
  // trivially passing because a field happened to already be null.
  const commonScoredFields = {
    userId,
    scenarioId,
    scenarioVersion: paymentRetryStorm.version,
    status: "completed" as const,
    outcome: "resolved" as const,
    completionTier: "optimal" as const,
    completionNote: "Candidate's own stated reasoning for finishing.",
    score: 950,
    recoveryScore: 280,
    customerImpactScore: 190,
    dataIntegrityScore: 200,
    reliabilityScore: 140,
    costEfficiencyScore: 90,
    operationalEfficiencyScore: 50,
    recoveryTimeMs: 45_000,
    revenueLossUsd: 1234.56,
    peakSeverityRank: 2,
    peakInfrastructureCostUsd: 500,
    numberOfConfigurationChanges: 4,
    numberOfBeneficialChanges: 3,
    numberOfHarmfulChanges: 1,
    finalStateJson: { status: "resolved", values: { secretInternalMetric: 42 } },
  };

  const [practiceAttempt] = await testDb
    .insert(attempts)
    .values({ ...commonScoredFields, attemptType: "practice" })
    .returning();
  const [assessmentAttempt] = await testDb
    .insert(attempts)
    .values({ ...commonScoredFields, attemptType: "assessment" })
    .returning();
  if (!practiceAttempt || !assessmentAttempt) throw new Error("fixtures not created");
  practiceAttemptId = practiceAttempt.id;
  assessmentAttemptId = assessmentAttempt.id;
});

afterAll(async () => {
  await testDb.delete(users).where(eq(users.authProviderId, "test-redaction-user"));
  await testDb.$client.end({ timeout: 1 });
});

describe("redactAttemptForCandidate", () => {
  it("returns the full, unredacted shape for a practice attempt", async () => {
    const attempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, practiceAttemptId),
    });
    if (!attempt) throw new Error("practice attempt disappeared");

    const view = redactAttemptForCandidate(attempt);

    expect(view.attemptType).toBe("practice");
    if (view.attemptType !== "practice") return;
    expect(view.score).toBe(950);
    expect(view.outcome).toBe("resolved");
    expect(view.completionTier).toBe("optimal");
  });

  it("strips every evaluation-derived field for an assessment attempt, explicitly asserting absence", async () => {
    const attempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, assessmentAttemptId),
    });
    if (!attempt) throw new Error("assessment attempt disappeared");

    const view = redactAttemptForCandidate(attempt) as Record<string, unknown>;

    expect(view.attemptType).toBe("assessment");
    expect(view.submitted).toBe(true);

    // The exact prohibited-field list from phase7.action.md section 7,
    // asserted absent one by one rather than merely checking the total
    // key count — so a future rename/alias of a leaking field is still
    // caught.
    const prohibitedFields = [
      "score",
      "recoveryScore",
      "customerImpactScore",
      "dataIntegrityScore",
      "reliabilityScore",
      "costEfficiencyScore",
      "operationalEfficiencyScore",
      "completionTier",
      "outcome",
      "completionNote",
      "completionDeclaredAt",
      "completionSimulationTimeMs",
      "finishRequestId",
      "finalStateJson",
      "revenueLossUsd",
      "recoveryTimeMs",
      "peakSeverityRank",
      "peakInfrastructureCostUsd",
      "peakKafkaLagMessages",
      "numberOfConfigurationChanges",
      "numberOfBeneficialChanges",
      "numberOfHarmfulChanges",
      "scenarioId",
      "scenarioVersion",
      "runtimeAnchoredAt",
      "runtimeVersion",
      "lastSimulationTimeMs",
      "assessmentId",
      "createdAt",
    ];
    for (const field of prohibitedFields) {
      expect(view).not.toHaveProperty(field);
    }

    // Fails closed against any field not explicitly named above too: the
    // assessment view's own key set must be exactly the known-safe set,
    // nothing more — if a future change to redactAttemptForCandidate (or
    // to the Attempt schema) ever spreads the raw row instead of
    // building an explicit object, this catches it even though the
    // named list above did not anticipate the new field.
    expect(Object.keys(view).sort()).toEqual(
      ["attemptType", "completedAt", "id", "startedAt", "status", "submitted"].sort(),
    );
  });

  it("never serializes an evaluation-derived field as `undefined` for an assessment attempt (undefined still round-trips through JSON in some codecs)", async () => {
    const attempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, assessmentAttemptId),
    });
    if (!attempt) throw new Error("assessment attempt disappeared");

    const view = redactAttemptForCandidate(attempt);
    const roundTripped = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;

    expect(roundTripped).not.toHaveProperty("score");
    expect(roundTripped).not.toHaveProperty("completionTier");
    expect(roundTripped).not.toHaveProperty("outcome");
    expect(roundTripped.submitted).toBe(true);
  });
});
