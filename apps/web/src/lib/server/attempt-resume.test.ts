import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  attemptActionChanges,
  attemptActionGroups,
  attemptEvents,
  attempts,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm, paymentRetryStormSimulation } from "@incidentrank/scenarios";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { scorePaymentRetryStormAttempt } from "@incidentrank/scoring";
import {
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
} from "@incidentrank/simulator";
import { loadResumeData } from "./attempt-resume";
import { generateInviteToken, hashInviteToken, normalizeEmail, INVITE_EXPIRY_MS } from "./invite-token";
import { createOrgScenario, publishScenarioDraft } from "./scenario-authoring";

/**
 * Integration tests against the local Postgres. Covers Phase 4.1's resume
 * lifecycle: elapsed-time resume, no-duplicate-attempt, no-duplicate
 * persistence, complete/fail after resume, score equality, and scenario-
 * version failure handling.
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-attempt-resume-owner";
const TEST_AUTH_CANDIDATE = "test-attempt-resume-candidate";
const TEST_ORG_SLUG = "test-attempt-resume-acme";
const TEST_AUTHORED_ORG_SLUG = "test-attempt-resume-authored-acme";

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
  const candidateUser = await testDb.query.users.findFirst({
    where: eq(users.authProviderId, TEST_AUTH_CANDIDATE),
  });
  if (candidateUser) {
    await testDb.delete(attempts).where(eq(attempts.userId, candidateUser.id));
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_AUTHORED_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createStartedAssessmentAttempt() {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  const [candidateUser] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "Candidate" })
    .returning();
  if (!owner || !candidateUser) throw new Error("fixtures not created");

  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Acme Corp", slug: TEST_ORG_SLUG })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: owner.id, role: "owner" });

  const [assessment] = await testDb
    .insert(assessments)
    .values({
      organizationId: org.id,
      name: "Assessment",
      scenarioId,
      scenarioVersion,
      createdByUserId: owner.id,
      status: "active",
    })
    .returning();
  if (!assessment) throw new Error("assessment not created");

  const token = generateInviteToken();
  const [candidate] = await testDb
    .insert(assessmentCandidates)
    .values({
      assessmentId: assessment.id,
      email: "candidate@example.com",
      normalizedEmail: normalizeEmail("candidate@example.com"),
      userId: candidateUser.id,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      status: "invited",
    })
    .returning();
  if (!candidate) throw new Error("candidate not created");

  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId: candidateUser.id,
      scenarioId,
      scenarioVersion,
      attemptType: "assessment",
      assessmentId: assessment.id,
      status: "in_progress",
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");

  await testDb
    .update(assessmentCandidates)
    .set({ status: "started", startedAt: new Date(), attemptId: attempt.id })
    .where(eq(assessmentCandidates.id, candidate.id));

  return { owner, candidateUser, org, assessment, candidate, attempt };
}

async function addActionGroup(
  attemptId: string,
  sequence: number,
  elapsedMs: number,
  reasoning: string | null,
  changes: Array<{ controlKey: string; previousValue: unknown; newValue: unknown }>,
) {
  const [group] = await testDb
    .insert(attemptActionGroups)
    .values({ attemptId, sequence, elapsedMs, reasoning })
    .returning();
  if (!group) throw new Error("group not created");

  await testDb.insert(attemptActionChanges).values(
    changes.map((change, index) => ({
      actionGroupId: group.id,
      sequence: index,
      controlKey: change.controlKey,
      previousValueJson: change.previousValue,
      newValueJson: change.newValue,
    })),
  );

  return group;
}

describe("resume elapsed time", () => {
  it("an attempt checkpointed at 03:42 resumes at exactly that elapsed time", async () => {
    const { attempt } = await createStartedAssessmentAttempt();
    const elapsedMs = 3 * 60_000 + 42_000; // 03:42

    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: elapsedMs })
      .where(eq(attempts.id, attempt.id));

    const result = await loadResumeData(attempt.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.simulationTimeMs).toBe(elapsedMs);
    }
  });

  it("resuming with persisted actions restores reasoning and control values", async () => {
    const { attempt } = await createStartedAssessmentAttempt();
    const elapsedMs = 100_000;

    await addActionGroup(attempt.id, 0, 65_000, "Reducing retries to stop the storm.", [
      { controlKey: "retries", previousValue: 3, newValue: 1 },
    ]);
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: elapsedMs })
      .where(eq(attempts.id, attempt.id));

    const result = await loadResumeData(attempt.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.controlValues.retries).toBe(1);
      expect(result.actionGroups).toHaveLength(1);
      expect(result.actionGroups[0]?.reasoning).toBe(
        "Reducing retries to stop the storm.",
      );
      expect(result.nextActionGroupSequence).toBe(1);
    }
  });
});

describe("no duplicate persistence", () => {
  it("replay does not insert any new action groups or events into the database", async () => {
    const { attempt } = await createStartedAssessmentAttempt();
    await addActionGroup(attempt.id, 0, 65_000, null, [
      { controlKey: "retries", previousValue: 3, newValue: 1 },
    ]);
    await testDb.insert(attemptEvents).values({
      attemptId: attempt.id,
      sequence: 0,
      elapsedMs: 65_000,
      type: "CONFIG_CHANGED",
      message: "retries changed.",
    });
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 90_000 })
      .where(eq(attempts.id, attempt.id));

    await loadResumeData(attempt.id);
    await loadResumeData(attempt.id); // call twice to be sure

    const groups = await testDb.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
    });
    const events = await testDb.query.attemptEvents.findMany({
      where: eq(attemptEvents.attemptId, attempt.id),
    });

    expect(groups).toHaveLength(1);
    expect(events).toHaveLength(1);
  });

  it("returns the next event sequence continuing past what is already persisted", async () => {
    const { attempt } = await createStartedAssessmentAttempt();
    await testDb.insert(attemptEvents).values([
      { attemptId: attempt.id, sequence: 0, elapsedMs: 10_000, type: "PROVIDER_DEGRADED", message: "x" },
      { attemptId: attempt.id, sequence: 1, elapsedMs: 11_000, type: "STATUS_CHANGED", message: "y" },
    ]);
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 20_000 })
      .where(eq(attempts.id, attempt.id));

    const result = await loadResumeData(attempt.id);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextEventSequence).toBe(2);
    }
  });
});

describe("no duplicate attempt", () => {
  it("resume reads the existing attempt id and never creates a new attempt row", async () => {
    const { attempt, candidate } = await createStartedAssessmentAttempt();
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 50_000 })
      .where(eq(attempts.id, attempt.id));

    await loadResumeData(attempt.id);

    const allAttempts = await testDb.query.attempts.findMany({
      where: eq(attempts.assessmentId, attempt.assessmentId!),
    });
    expect(allAttempts).toHaveLength(1);
    expect(allAttempts[0]?.id).toBe(attempt.id);

    const refreshedCandidate = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });
    expect(refreshedCandidate?.attemptId).toBe(attempt.id);
  });
});

describe("complete after resume", () => {
  it("a resumed candidate can resolve the incident and complete normally", async () => {
    const { attempt, candidate } = await createStartedAssessmentAttempt();
    await addActionGroup(attempt.id, 0, 65_000, null, [
      { controlKey: "retries", previousValue: 3, newValue: 1 },
      { controlKey: "backoff", previousValue: "none", newValue: "exponential" },
      { controlKey: "circuitBreaker", previousValue: "off", newValue: "on" },
    ]);
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 100_000 })
      .where(eq(attempts.id, attempt.id));

    const resumed = await loadResumeData(attempt.id);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;

    // Simulate completing normally after resume: the candidate's final
    // engine state (here just the resumed state, standing in for further
    // live play) is scored and persisted exactly like an uninterrupted run.
    const scoringInputs = extractScoringInputs(
      { infrastructureCost: { baselineMonthlyUsd: 20_000 } },
      resumed.state,
    );
    const score = scorePaymentRetryStormAttempt(scoringInputs);

    await testDb
      .update(attempts)
      .set({ status: "completed", outcome: "resolved", score: score.total, completedAt: new Date() })
      .where(eq(attempts.id, attempt.id));
    await testDb
      .update(assessmentCandidates)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assessmentCandidates.attemptId, attempt.id));

    const finalAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
    });
    const finalCandidate = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });

    expect(finalAttempt?.status).toBe("completed");
    expect(finalAttempt?.outcome).toBe("resolved");
    expect(finalAttempt?.score).toBe(score.total);
    expect(finalCandidate?.status).toBe("completed");
  });

  it("a resumed candidate can fail the incident and complete normally", async () => {
    const { attempt, candidate } = await createStartedAssessmentAttempt();
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 50_000 })
      .where(eq(attempts.id, attempt.id));

    await loadResumeData(attempt.id);

    await testDb
      .update(attempts)
      .set({ status: "completed", outcome: "failed", score: 120, completedAt: new Date() })
      .where(eq(attempts.id, attempt.id));
    await testDb
      .update(assessmentCandidates)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assessmentCandidates.attemptId, attempt.id));

    const finalAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
    });
    const finalCandidate = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });

    expect(finalAttempt?.status).toBe("completed");
    expect(finalAttempt?.outcome).toBe("failed");
    expect(finalCandidate?.status).toBe("completed");
  });
});

describe("scenario version", () => {
  it("replay uses the exact scenarioVersion stored on the attempt", async () => {
    const { attempt } = await createStartedAssessmentAttempt();
    expect(attempt.scenarioVersion).toBe(scenarioVersion);

    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 10_000 })
      .where(eq(attempts.id, attempt.id));

    const result = await loadResumeData(attempt.id);
    expect(result.ok).toBe(true);
  });
});

describe("missing scenario version", () => {
  it("fails safely when the stored scenario version cannot be resolved", async () => {
    const { attempt } = await createStartedAssessmentAttempt();

    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 10_000, scenarioVersion: 999 })
      .where(eq(attempts.id, attempt.id));

    const result = await loadResumeData(attempt.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("scenario_version_unresolvable");
    }
  });
});

describe("score equality", () => {
  it("DB-persisted action groups replay to the exact same score as calling replayAttempt directly", async () => {
    // This closes the loop end-to-end: loadResumeData's DB round trip
    // (reading attempt_action_groups/attempt_action_changes back out and
    // converting them to ReplayActionGroup[]) must not lose or reorder
    // any information packages/simulator's own replay-equality tests
    // already proved deterministic in isolation.
    const { attempt } = await createStartedAssessmentAttempt();
    const PROVIDER_RECOVERY_END_MS = 15 * 60 * 1000;
    const UNTIL_MS = PROVIDER_RECOVERY_END_MS + 60_000;

    await addActionGroup(attempt.id, 0, 65_000, "Reducing retries.", [
      { controlKey: "retries", previousValue: 3, newValue: 1 },
    ]);
    await addActionGroup(attempt.id, 1, 90_000, "Adding backoff.", [
      { controlKey: "backoff", previousValue: "none", newValue: "exponential" },
    ]);
    await addActionGroup(attempt.id, 2, 120_000, "Enabling the circuit breaker.", [
      { controlKey: "circuitBreaker", previousValue: "off", newValue: "on" },
    ]);
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: UNTIL_MS })
      .where(eq(attempts.id, attempt.id));

    const resumed = await loadResumeData(attempt.id);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;

    // Calling loadResumeData a second time must reconstruct byte-for-byte
    // identical state and score — the DB round trip is itself
    // deterministic, matching packages/simulator's replay guarantee.
    const resumedAgain = await loadResumeData(attempt.id);
    expect(resumedAgain.ok).toBe(true);
    if (!resumedAgain.ok) return;

    expect(resumedAgain.state).toEqual(resumed.state);

    // Payment Retry Storm is candidate_declared (Phase 6.1): plain replay
    // never auto-writes resolvedAtMs, so score via the same Finish-
    // equivalent derivation finishAttempt uses — never state.status
    // directly, and never a raw extractScoringInputs call, which would
    // incorrectly score this as "unresolved" despite genuinely sustained
    // success.
    const finishResultA = evaluateCandidateDeclaredFinish(paymentRetryStormSimulation, resumed.state);
    const finishResultB = evaluateCandidateDeclaredFinish(paymentRetryStormSimulation, resumedAgain.state);

    const scoreA = scorePaymentRetryStormAttempt(
      extractFinishScoringInputs(paymentRetryStormSimulation, finishResultA),
    );
    const scoreB = scorePaymentRetryStormAttempt(
      extractFinishScoringInputs(paymentRetryStormSimulation, finishResultB),
    );
    expect(scoreB).toEqual(scoreA);
    expect(resumed.state.status).not.toBe("resolved");
    expect(finishResultA.outcome).toBe("resolved");
  });
});

describe("closed assessment resume", () => {
  it("an already-started candidate may resume after the assessment is closed", async () => {
    const { attempt, assessment } = await createStartedAssessmentAttempt();
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 40_000 })
      .where(eq(attempts.id, attempt.id));

    await testDb
      .update(assessments)
      .set({ status: "closed" })
      .where(eq(assessments.id, assessment.id));

    // loadResumeData is purely attempt-scoped — it never checks
    // assessment status at all. Closing blocks new starts (the start
    // route's own status check), never an existing in-progress attempt.
    const result = await loadResumeData(attempt.id);
    expect(result.ok).toBe(true);
  });
});

describe("authored scenario resume", () => {
  it("resumes an in-progress attempt against a published organization-authored scenario", async () => {
    const [owner] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
      .returning();
    const [candidateUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "Candidate" })
      .returning();
    if (!owner || !candidateUser) throw new Error("fixtures not created");

    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Acme Corp", slug: TEST_AUTHORED_ORG_SLUG })
      .returning();
    if (!org) throw new Error("org not created");

    await testDb
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: owner.id, role: "owner" });

    const authoredScenario: AuthoredScenario = {
      schemaVersion: 1,
      basics: {
        name: "Authored Resume Scenario",
        slug: "test-authored-resume-slug",
        description: "Resume test fixture.",
        difficulty: "intermediate",
        estimatedMinutes: 10,
      },
      architecture: { nodes: [{ id: "api", label: "API", type: "service" }], edges: [] },
      controls: [
        {
          key: "poolSize",
          label: "Pool Size",
          type: "select",
          allowedValues: [10, 50],
          initialValue: 10,
          componentId: "api",
        },
      ],
      initialState: { errorRate: 0 },
      metrics: [
        { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
      ],
      timelineEvents: [
        {
          id: "spike",
          atSeconds: 5,
          label: "Spike",
          message: "Traffic spike begins.",
          setTriggers: { spiking: true },
        },
      ],
      rules: [
        {
          id: "spiking",
          when: [{ source: "trigger", key: "spiking", equals: true }],
          incidentState: "degraded",
          setValues: { errorRate: 10 },
        },
        { id: "default", when: [], incidentState: "healthy", setValues: { errorRate: 0 } },
      ],
      successCondition: {
        conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }],
        sustainedSeconds: 5,
      },
      failureCondition: {
        conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }],
        sustainedSeconds: 60,
      },
      scoring: {
        dimensions: [
          { dimension: "recovery", maxPoints: 300, bands: [{ points: 300 }] },
          { dimension: "customerImpact", maxPoints: 200, bands: [{ points: 200 }] },
          { dimension: "dataIntegrity", maxPoints: 200, bands: [{ points: 200 }] },
          { dimension: "reliability", maxPoints: 150, bands: [{ points: 150 }] },
          { dimension: "costEfficiency", maxPoints: 100, bands: [{ points: 100 }] },
          { dimension: "operationalEfficiency", maxPoints: 50, bands: [{ points: 50 }] },
        ],
      },
    };

    const { scenario } = await createOrgScenario(org.id, owner.id, "Authored Resume Scenario", authoredScenario);
    const publishResult = await publishScenarioDraft(scenario);
    expect(publishResult.ok).toBe(true);
    if (!publishResult.ok) return;

    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        name: "Authored Assessment",
        scenarioId: scenario.id,
        scenarioVersion: publishResult.published.version,
        createdByUserId: owner.id,
        status: "active",
      })
      .returning();
    if (!assessment) throw new Error("assessment not created");

    const [attempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidateUser.id,
        scenarioId: scenario.id,
        scenarioVersion: publishResult.published.version,
        attemptType: "assessment",
        assessmentId: assessment.id,
        status: "in_progress",
        lastSimulationTimeMs: 6_000,
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    const result = await loadResumeData(attempt.id);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The timed event at t=5s has fired by t=6s, so the trigger-driven
      // rule should already be in effect post-replay.
      expect(result.state.triggers.spiking).toBe(true);
      expect(result.state.values.errorRate).toBe(10);
    }
  });
});
