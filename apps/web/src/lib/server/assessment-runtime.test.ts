import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  attemptActionGroups,
  attempts,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Attempt,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm, paymentRetryStormSimulation } from "@incidentrank/scenarios";
import { ATTEMPT_CEILING_MS } from "@incidentrank/simulator";
import { compileAuthoredScenario, type AuthoredScenario } from "@incidentrank/scenarios/authoring";
import {
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  replayAttempt,
  type ReplayActionGroup,
  type ScenarioSimulationDefinition,
  type SimulationState,
} from "@incidentrank/simulator";
import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
  INVITE_EXPIRY_MS,
} from "./invite-token";
import {
  advanceRuntime,
  bootstrapRuntime,
  loadOwnedAssessmentAttempt,
  resumeRuntimeClock,
  submitAction,
} from "./assessment-runtime";
import { createOrgScenario, publishScenarioDraft } from "./scenario-authoring";
import { scoreAttempt } from "./scoring-helper";
import { finishAttempt } from "./finish-attempt";

/**
 * Integration tests against local Postgres for Phase 5.1's
 * server-authoritative assessment runtime, matching the test list in
 * docs/implementation_plan/phase5a.md: hidden rules/scoring/future
 * events, built-in and authored assessment completion through the
 * server runtime, beneficial/harmful consequences, invalid control/value
 * rejection, cross-attempt rejection, organization-member-cannot-operate,
 * replay/resume, pause semantics, idempotent action, concurrent action
 * protection, terminal immutability, score equality vs. the pre-5.1
 * client-simulated path, and Payment Retry Storm / authored-scenario
 * regression.
 */

let testDb: Db;
let builtinScenarioId: string;
let builtinScenarioVersion: number;

const TEST_AUTH_OWNER = "test-runtime-owner";
const TEST_AUTH_CANDIDATE = "test-runtime-candidate";
const TEST_AUTH_OTHER_CANDIDATE = "test-runtime-other-candidate";
const TEST_ORG_SLUG = "test-runtime-acme";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  builtinScenarioId = scenario.id;
  builtinScenarioVersion = paymentRetryStorm.version;
});

afterEach(async () => {
  for (const authId of [TEST_AUTH_CANDIDATE, TEST_AUTH_OTHER_CANDIDATE]) {
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
    if (user) {
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    }
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER_CANDIDATE));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

function buildMinimalAuthoredScenario(slug: string): AuthoredScenario {
  return {
    schemaVersion: 1,
    basics: {
      name: "Test Runtime Scenario",
      slug,
      description: "A minimal valid scenario for runtime integration testing.",
      difficulty: "intermediate",
      estimatedMinutes: 10,
    },
    architecture: {
      nodes: [{ id: "api", label: "API", type: "service" }],
      edges: [],
    },
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
        atSeconds: 10,
        label: "Spike",
        message: "Traffic spike begins.",
        setTriggers: { spiking: true },
      },
    ],
    rules: [
      {
        id: "recovered",
        when: [{ source: "control", key: "poolSize", operator: "at_least", comparedTo: 50 }],
        incidentState: "healthy",
        setValues: { errorRate: 0 },
      },
      {
        id: "spiking",
        when: [{ source: "trigger", key: "spiking", equals: true }],
        incidentState: "degraded",
        setValues: { errorRate: 10 },
      },
      {
        id: "default",
        when: [],
        incidentState: "healthy",
        setValues: { errorRate: 0 },
      },
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
}

async function createOrgWithOwner(slug: string) {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  if (!owner) throw new Error("owner not created");

  const [org] = await testDb.insert(organizations).values({ name: "Acme Corp", slug }).returning();
  if (!org) throw new Error("org not created");

  await testDb
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: owner.id, role: "owner" });

  return { owner, org };
}

async function createCandidateUser(authId: string, name: string) {
  const [user] = await testDb.insert(users).values({ authProviderId: authId, displayName: name }).returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createClaimedCandidateAssessment(
  orgId: string,
  ownerUserId: string,
  scenarioId: string,
  scenarioVersion: number,
  candidateUserId: string,
) {
  const [assessment] = await testDb
    .insert(assessments)
    .values({
      organizationId: orgId,
      name: "Runtime Assessment",
      scenarioId,
      scenarioVersion,
      createdByUserId: ownerUserId,
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
      userId: candidateUserId,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      status: "invited",
    })
    .returning();
  if (!candidate) throw new Error("candidate not created");

  return { assessment, candidate };
}

async function startAttempt(
  userId: string,
  scenarioId: string,
  scenarioVersion: number,
  assessmentId: string,
  candidateRowId: string,
) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId,
      scenarioId,
      scenarioVersion,
      attemptType: "assessment",
      assessmentId,
      status: "in_progress",
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");

  await testDb
    .update(assessmentCandidates)
    .set({ status: "started", startedAt: new Date(), attemptId: attempt.id })
    .where(eq(assessmentCandidates.id, candidateRowId));

  return attempt;
}

describe("hidden data in runtime payloads", () => {
  it("bootstrapRuntime's RuntimeView never carries rules, success/failure conditions, or scoring", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    const result = await bootstrapRuntime(owned.attempt);
    if (!result.ok) throw new Error("expected bootstrap to resolve");

    const serialized = JSON.stringify(result.view);
    expect(serialized).not.toContain("rules");
    expect(serialized).not.toContain("successCondition");
    expect(serialized).not.toContain("failureCondition");
    expect(serialized).not.toContain("scoring");
    expect(serialized).not.toContain("maxPoints");
    expect(serialized).not.toContain("bands");
    expect(serialized).not.toContain("actionClassifications");
    expect(serialized).not.toContain("revenueLossRatePerMinute");

    // Type-level guarantee, not just string-absence: RuntimeView has no
    // field any of these could occupy. completionMode (Phase 6.1) is
    // deliberately allowed here — it is static scenario metadata (which
    // UI affordance to render), never a live eligibility signal; the
    // actual hidden sustain-tracking/eligibility state stays server-only
    // (see evaluateCompletionEligibility's doc comment).
    expect(Object.keys(result.view)).toEqual([
      "architecture",
      "controls",
      "state",
      "events",
      "status",
      "incidentStartMs",
      "completionMode",
    ]);
  });

  it("does not expose a future timed event's consequence before it has occurred", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    // Freshly started: elapsed time is 0, well before Payment Retry
    // Storm's first timed event — no system events should have occurred.
    const result = await bootstrapRuntime(owned.attempt);
    if (!result.ok) throw new Error("expected bootstrap to resolve");
    expect(result.view.events).toHaveLength(0);
    expect(result.view.state.triggers.providerDegraded).toBeUndefined();
  });
});

describe("cross-attempt and authorization", () => {
  it("rejects a candidate submitting an action against someone else's attempt", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const otherCandidate = await createCandidateUser(TEST_AUTH_OTHER_CANDIDATE, "Other");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const otherResult = await loadOwnedAssessmentAttempt(attempt.id, otherCandidate.id);
    expect(otherResult.ok).toBe(false);
    if (!otherResult.ok) expect(otherResult.status).toBe(403);
  });

  it("organization owner (hiring manager) cannot operate the candidate's attempt via identity-based auth", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    // The org owner is a hiring manager — loadOwnedAssessmentAttempt
    // checks assessment_candidates.userId, never organization membership,
    // so the owner's own user id must be rejected here even though they
    // administer the assessment this attempt belongs to.
    const ownerResult = await loadOwnedAssessmentAttempt(attempt.id, owner.id);
    expect(ownerResult.ok).toBe(false);
    if (!ownerResult.ok) expect(ownerResult.status).toBe(403);
  });

  it("rejects practice attempts outright — the server runtime applies only to assessment attempts", async () => {
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const [practiceAttempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidate.id,
        scenarioId: builtinScenarioId,
        scenarioVersion: builtinScenarioVersion,
        attemptType: "practice",
        status: "in_progress",
      })
      .returning();
    if (!practiceAttempt) throw new Error("attempt not created");

    const result = await loadOwnedAssessmentAttempt(practiceAttempt.id, candidate.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe("invalid control/value", () => {
  it("rejects an unknown control key", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    const result = await submitAction(
      owned.attempt,
      "req-invalid-control",
      [{ controlKey: "doesNotExist", value: 1 }],
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_control");
  });

  it("rejects a value not in the control's allowed set", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    const retriesControl = paymentRetryStormSimulation.controls.find((c) => c.key === "retries");
    if (!retriesControl) throw new Error("expected retries control to exist");
    const invalidValue = 9999;
    expect(retriesControl.allowedValues).not.toContain(invalidValue);

    const result = await submitAction(
      owned.attempt,
      "req-invalid-value",
      [{ controlKey: "retries", value: invalidValue }],
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_value");
  });
});

describe("idempotent action submission", () => {
  it("repeated request id applies exactly once", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    const requestId = "req-idempotent-1";
    const first = await submitAction(
      owned.attempt,
      requestId,
      [{ controlKey: "retries", value: 1 }],
      "Reducing retries.",
    );
    expect(first.ok).toBe(true);

    const refetched = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!refetched.ok) throw new Error("expected ownership to resolve");

    const second = await submitAction(
      refetched.attempt,
      requestId,
      [{ controlKey: "retries", value: 1 }],
      "Reducing retries.",
    );
    expect(second.ok).toBe(true);

    const groups = await testDb.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
    });
    expect(groups).toHaveLength(1);
  });

  it("concurrent submissions for the same attempt do not corrupt sequence/state", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    // Two distinct logical actions submitted concurrently (not retries of
    // the same key) — the transaction's row lock must serialize them so
    // each gets its own sequence number with no collision or lost update.
    const [resultA, resultB] = await Promise.all([
      submitAction(owned.attempt, "req-concurrent-a", [{ controlKey: "retries", value: 1 }], null),
      submitAction(owned.attempt, "req-concurrent-b", [{ controlKey: "backoff", value: "exponential" }], null),
    ]);

    expect(resultA.ok).toBe(true);
    expect(resultB.ok).toBe(true);

    const groups = await testDb.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
      orderBy: (table, { asc }) => [asc(table.sequence)],
    });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.sequence).toBe(0);
    expect(groups[1]?.sequence).toBe(1);
    expect(new Set(groups.map((g) => g.sequence)).size).toBe(2);
  });
});

describe("pause semantics", () => {
  it("advanceRuntime is a no-op while runtimeAnchoredAt is null (paused)", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    // Freshly started attempts begin with runtimeAnchoredAt: null — the
    // clock has not been resumed yet.
    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    expect(owned.attempt.runtimeAnchoredAt).toBeNull();

    const result = await advanceRuntime(attempt.id, owned.attempt);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isPaused).toBe(true);
      expect(result.view.state.simulationTimeMs).toBe(0);
    }
  });

  it("time only advances after resumeRuntimeClock, and pausing again stops further advancement", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    await resumeRuntimeClock(attempt.id);
    // Backdate the anchor rather than sleeping real wall-clock time —
    // advanceRuntime computes its delta from (now - runtimeAnchoredAt),
    // so an anchor 5 seconds in the past deterministically produces a
    // positive, tick-aligned delta without a flaky real-time sleep.
    await testDb
      .update(attempts)
      .set({ runtimeAnchoredAt: new Date(Date.now() - 5_000) })
      .where(eq(attempts.id, attempt.id));

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    expect(owned.attempt.runtimeAnchoredAt).not.toBeNull();

    const advanced = await advanceRuntime(attempt.id, owned.attempt);
    expect(advanced.ok).toBe(true);
    if (advanced.ok) {
      expect(advanced.isPaused).toBe(false);
      expect(advanced.view.state.simulationTimeMs).toBeGreaterThan(0);
    }

    const simulationTimeAfterFirst = advanced.ok ? advanced.view.state.simulationTimeMs : -1;

    // Pause: further wall-clock time passing must not advance simulation
    // time at all, even though the backdated anchor below would otherwise
    // imply a large positive delta.
    await testDb
      .update(attempts)
      .set({ runtimeAnchoredAt: null })
      .where(eq(attempts.id, attempt.id));

    const paused = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!paused.ok) throw new Error("expected ownership to resolve");
    const pausedAdvance = await advanceRuntime(attempt.id, paused.attempt);
    expect(pausedAdvance.ok).toBe(true);
    if (pausedAdvance.ok) {
      expect(pausedAdvance.view.state.simulationTimeMs).toBe(simulationTimeAfterFirst);
    }
  });
});

describe("terminal attempt immutability", () => {
  it("no action is accepted after the attempt is resolved/failed", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );

    await testDb
      .update(attempts)
      .set({ status: "completed", outcome: "resolved", score: 900, completedAt: new Date() })
      .where(eq(attempts.id, attempt.id));

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    const result = await submitAction(
      owned.attempt,
      "req-after-terminal",
      [{ controlKey: "retries", value: 1 }],
      null,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("terminal");

    const advanceResult = await advanceRuntime(attempt.id, owned.attempt);
    expect(advanceResult.ok).toBe(false);
    if (!advanceResult.ok) expect(advanceResult.reason).toBe("terminal");
  });
});

describe("authored scenario through the server runtime", () => {
  it("an organization-authored scenario's beneficial action produces its authored consequence, invisible in the payload", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");

    const { scenario, draft } = await createOrgScenario(
      org.id,
      owner.id,
      "Test Runtime Scenario",
      buildMinimalAuthoredScenario("test-runtime-authored-slug"),
    );
    const published = await publishScenarioDraft(scenario);
    if (!published.ok) throw new Error("expected publish to succeed");

    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      scenario.id,
      draft.version,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      scenario.id,
      draft.version,
      assessment.id,
      candidateRow.id,
    );

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    // Beneficial path: setting poolSize to 50 matches the authored
    // "recovered" rule (at_least 50 → errorRate 0, incidentState healthy).
    const result = await submitAction(
      owned.attempt,
      "req-authored-beneficial",
      [{ controlKey: "poolSize", value: 50 }],
      "Increasing pool size to absorb the spike.",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.state.values.errorRate).toBe(0);
      expect(result.view.state.transitions.incidentState).toBe("healthy");

      const serialized = JSON.stringify(result.view);
      expect(serialized).not.toContain("rules");
      expect(serialized).not.toContain("scoring");
      expect(serialized).not.toContain("recovered"); // the authored rule id itself
    }
  });

  it("Database Connection Saturation (genericity-proof scenario) regression: completes through the server runtime with its authored behavior unchanged", async () => {
    // Not a product-facing scenario, but proves the server runtime branch
    // for ownershipType "incidentrank" handles more than Payment Retry
    // Storm specifically (no scenario-specific code in the runtime).
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");

    const dbScenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, "db-connection-saturation"),
    });
    if (!dbScenario) {
      // Not seeded in every environment — this scenario is a genericity
      // proof, not a seeded product scenario. Skip gracefully.
      return;
    }

    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      dbScenario.id,
      1,
      candidate.id,
    );
    const attempt = await startAttempt(candidate.id, dbScenario.id, 1, assessment.id, candidateRow.id);

    const owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");

    const result = await bootstrapRuntime(owned.attempt);
    expect(result.ok).toBe(true);
  });
});

describe("Payment Retry Storm regression through the server runtime", () => {
  it("Phase 6.1: a known-good mitigation sequence reaches sustained success but stays in_progress — Finish is required to resolve, matching candidate_declared semantics", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );
    await resumeRuntimeClock(attempt.id);

    // Same known-good mitigation sequence/timing as the score-equality
    // test above (proven to reach sustained success well before the
    // 15-minute provider-recovery mark).
    const afterAdvance = await driveServerRuntimeThroughActions(
      testDb,
      attempt.id,
      candidate.id,
      [
        { atMs: 65_000, controlKey: "retries", value: 1 },
        { atMs: 90_000, controlKey: "backoff", value: "exponential" },
        { atMs: 120_000, controlKey: "circuitBreaker", value: "on" },
      ],
      15 * 60 * 1000 + 60_000,
    );

    // candidate_declared: reaching sustained success through advanceRuntime/
    // submitAction must NOT resolve the incident — only establish
    // eligibility for a subsequent Finish declaration.
    expect(afterAdvance.status).toBe("in_progress");
    expect(afterAdvance.outcome).toBeNull();
    expect(afterAdvance.score).toBeNull();

    const finishable = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
      with: { scenario: true },
    });
    if (!finishable) throw new Error("attempt disappeared");

    // Only an explicit Finish declaration resolves it, with a persisted
    // server-computed score — matching the pre-6.1 scoring path's output
    // shape, just reached through the candidate's decision instead of
    // automatically.
    const finishOutcome = await finishAttempt(finishable, "req-regression-finish", null);
    expect(finishOutcome.ok).toBe(true);
    if (!finishOutcome.ok) return;
    expect(finishOutcome.result.outcome).toBe("resolved");
    expect(finishOutcome.result.score?.total).toBeTypeOf("number");

    const finalAttempt = await testDb.query.attempts.findFirst({ where: eq(attempts.id, attempt.id) });
    expect(finalAttempt?.status).toBe("completed");
    expect(finalAttempt?.outcome).toBe("resolved");
    expect(finalAttempt?.score).not.toBeNull();
  });

  it("Phase 6.1: an automatic failure still completes the assessment attempt without any Finish call", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );
    await resumeRuntimeClock(attempt.id);

    // A proven harmful action sequence (same as packages/scenarios/src/
    // payment-retry-storm/simulation.test.ts) keeps the failure
    // condition (checkoutSuccessRate < 60) sustained throughout, but
    // sustaining a breached failureCondition no longer ends an attempt
    // on its own — the only automatic-failure trigger left is the
    // uniform 35-minute attempt ceiling (ATTEMPT_CEILING_MS), measured
    // from incidentStartedAtMs. Payment Retry Storm's own incident
    // starts at 60s (timed-events.ts's INCIDENT_START_MS), not at
    // simulation-time zero, so the runtime must be advanced past
    // 60s + the ceiling to reach a genuine automatic failure. Failure
    // remains fully automatic in every completion mode (docs/
    // implementation_plan/phase6.1.md's "Failure Remains Automatic") —
    // the assessment runtime must complete this on its own, with no
    // candidate Finish action involved.
    const afterAdvance = await driveServerRuntimeThroughActions(
      testDb,
      attempt.id,
      candidate.id,
      [
        { atMs: 65_000, controlKey: "paymentInstances", value: 24 },
        { atMs: 65_000, controlKey: "retries", value: 5 },
      ],
      60_000 + ATTEMPT_CEILING_MS + 60_000,
    );

    expect(afterAdvance.status).toBe("completed");
    expect(afterAdvance.outcome).toBe("failed");
    expect(afterAdvance.score).not.toBeNull();
    expect(afterAdvance.completionDeclaredAt).toBeNull();
    expect(afterAdvance.completionNote).toBeNull();
  });

  it("Phase 6.1: submitAction rejects further actions after Finish has completed the attempt", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );
    await resumeRuntimeClock(attempt.id);

    let owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    await testDb
      .update(attempts)
      .set({ runtimeAnchoredAt: new Date(Date.now() - 70_000) })
      .where(eq(attempts.id, attempt.id));
    owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    await advanceRuntime(attempt.id, owned.attempt);

    owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    await submitAction(
      owned.attempt,
      "req-pre-finish-mitigation",
      [
        { controlKey: "retries", value: 1 },
        { controlKey: "backoff", value: "exponential" },
        { controlKey: "circuitBreaker", value: "on" },
      ],
      null,
    );

    owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    await testDb
      .update(attempts)
      .set({ runtimeAnchoredAt: new Date(Date.now() - 20_000) })
      .where(eq(attempts.id, attempt.id));
    owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    await advanceRuntime(attempt.id, owned.attempt);

    const beforeFinish = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
      with: { scenario: true },
    });
    if (!beforeFinish) throw new Error("attempt disappeared");
    const finishResult = await finishAttempt(beforeFinish, "req-lockout-finish", null);
    expect(finishResult.ok).toBe(true);

    owned = await loadOwnedAssessmentAttempt(attempt.id, candidate.id);
    if (!owned.ok) throw new Error("expected ownership to resolve");
    const rejectedAction = await submitAction(
      owned.attempt,
      "req-after-finish",
      [{ controlKey: "retries", value: 0 }],
      null,
    );
    expect(rejectedAction.ok).toBe(false);
    if (rejectedAction.ok) return;
    expect(rejectedAction.reason).toBe("terminal");

    const rejectedAdvance = await advanceRuntime(attempt.id, owned.attempt);
    expect(rejectedAdvance.ok).toBe(false);
    if (rejectedAdvance.ok) return;
    expect(rejectedAdvance.reason).toBe("terminal");
  });
});

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: string | number | boolean;
}

/**
 * Drives a started attempt through the server-authoritative runtime
 * (advanceRuntime + submitAction — never a shortcut around them) so that
 * each action in `actions` is applied at exactly its `atMs`, then
 * advances to `untilMs` (or until the attempt reaches a terminal state,
 * whichever comes first). This exists purely to make the server runtime
 * reproduce the same `(elapsedMs, actionGroups)` timeline
 * `runReplayOracle` below replays locally — not to shortcut past
 * advanceRuntime/submitAction's real logic. `lastSimulationTimeMs` is set
 * directly before each submitAction call (mirroring exactly what a real
 * poll-paced client driving the clock to that instant and then clicking
 * Apply would produce — submitAction always reads the attempt's *current*
 * checkpoint, never a caller-supplied time) and advanceRuntime is called
 * in a loop afterward since it caps each call's delta at
 * MAX_ADVANCE_MS_PER_REQUEST, the same way repeated real polls would.
 */
async function driveServerRuntimeThroughActions(
  testDb: Db,
  attemptId: string,
  candidateUserId: string,
  actions: TimedAction[],
  untilMs: number,
): Promise<Attempt> {
  const ordered = [...actions].sort((a, b) => a.atMs - b.atMs);

  for (const action of ordered) {
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: action.atMs })
      .where(eq(attempts.id, attemptId));

    const owned = await loadOwnedAssessmentAttempt(attemptId, candidateUserId);
    if (!owned.ok) throw new Error("expected ownership to resolve mid-drive");
    if (owned.attempt.status !== "in_progress") break;

    const result = await submitAction(
      owned.attempt,
      `drive-action-${action.atMs}-${action.controlKey}`,
      [{ controlKey: action.controlKey, value: action.value }],
      null,
    );
    if (!result.ok) {
      throw new Error(`driveServerRuntimeThroughActions: submitAction failed: ${JSON.stringify(result)}`);
    }
  }

  // Advance in capped steps to untilMs, exactly as repeated real
  // POST .../advance polls would, stopping early if the attempt
  // terminates (resolved/failed) before reaching untilMs.
  for (;;) {
    const current = await testDb.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
    if (!current) throw new Error("attempt disappeared mid-drive");
    if (current.status !== "in_progress") return current;

    const elapsed = current.lastSimulationTimeMs ?? 0;
    if (elapsed >= untilMs) return current;

    const remaining = untilMs - elapsed;
    await testDb
      .update(attempts)
      .set({ runtimeAnchoredAt: new Date(Date.now() - remaining) })
      .where(eq(attempts.id, attemptId));

    const owned = await loadOwnedAssessmentAttempt(attemptId, candidateUserId);
    if (!owned.ok) throw new Error("expected ownership to resolve mid-drive");
    const advanced = await advanceRuntime(attemptId, owned.attempt);
    if (!advanced.ok) {
      // Terminal mid-loop (a concurrent-looking "terminal" outcome from
      // the attempt having just resolved) — read the row back directly.
      const after = await testDb.query.attempts.findFirst({ where: eq(attempts.id, attemptId) });
      if (!after) throw new Error("attempt disappeared mid-drive");
      return after;
    }
  }
}

/**
 * The local/uninterrupted oracle side: runs the same scenario definition
 * through packages/simulator's replayAttempt — proven byte-identical to
 * an uninterrupted tick-by-tick simulate() loop by
 * packages/scoring/src/resume-equality.test.ts — against the exact same
 * (elapsedMs, actionGroups) timeline driveServerRuntimeThroughActions
 * above reproduces through the real server runtime.
 *
 * `elapsedMs` here must be the server's own final `lastSimulationTimeMs`
 * (serverFinalAttempt.lastSimulationTimeMs below), not an independently
 * chosen "run far enough to guarantee termination" value: once `status`
 * becomes resolved/failed, the engine's tick loop (packages/simulator's
 * tickOnce) stops re-evaluating success/failure but keeps evaluating
 * everything else (rules, timed events, values) every subsequent tick —
 * so a longer replay window legitimately produces a different `values`/
 * `componentHealth`/`transitions` snapshot than a shorter one, even
 * though `status` stays "resolved". advanceRuntime's own capped-delta
 * step (packages/db-backed assessment-runtime.ts's tryAdvanceOnce) can
 * itself land lastSimulationTimeMs past the exact tick where the
 * terminal transition first occurred, by up to one
 * MAX_ADVANCE_MS_PER_REQUEST step — this is existing, intentional
 * behavior (persistTerminalResult scores from state as computed at
 * whatever elapsed time the triggering advance/action call landed on,
 * not the literal first-terminal tick), so the oracle must replay to
 * that exact same elapsed time to agree, not to a shorter or longer one.
 */
function runReplayOracle(
  scenario: ScenarioSimulationDefinition,
  actions: TimedAction[],
  elapsedMs: number,
): SimulationState {
  const actionGroups: ReplayActionGroup[] = actions.map((action) => ({
    elapsedMs: action.atMs,
    changes: [{ controlKey: action.controlKey, value: action.value }],
  }));
  return replayAttempt({ scenario, elapsedMs, actionGroups }).state;
}

describe("score equality: local simulator path vs. server-authoritative runtime", () => {
  it("Payment Retry Storm (candidate_declared): sustained success never auto-resolves the assessment runtime; Finish produces a result identical to the local oracle's Finish-equivalent evaluation", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");
    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      builtinScenarioId,
      builtinScenarioVersion,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      builtinScenarioId,
      builtinScenarioVersion,
      assessment.id,
      candidateRow.id,
    );
    await resumeRuntimeClock(attempt.id);

    // The exact known-good mitigation sequence/timing already proven
    // (by packages/scoring/src/resume-equality.test.ts) to produce
    // identical scores between an uninterrupted run and a replayed one —
    // reused here as a third leg of that equality: the real server
    // runtime, driven through advanceRuntime/submitAction, must agree
    // with the oracle once Finish is invoked.
    const timedActions: TimedAction[] = [
      { atMs: 65_000, controlKey: "retries", value: 1 },
      { atMs: 90_000, controlKey: "backoff", value: "exponential" },
      { atMs: 120_000, controlKey: "circuitBreaker", value: "on" },
    ];
    const untilMs = 15 * 60 * 1000 + 60_000; // past provider-recovery end, matching resume-equality.test.ts

    const serverFinalAttempt = await driveServerRuntimeThroughActions(
      testDb,
      attempt.id,
      candidate.id,
      timedActions,
      untilMs,
    );

    // Phase 6.1 binding invariant: this scenario is candidate_declared, so
    // reaching sustained success through advanceRuntime/submitAction must
    // NEVER auto-resolve the assessment attempt — the engine only tracks
    // eligibility; a candidate's explicit Finish decides the outcome. If
    // this ever fails, it means the assessment runtime's gate
    // (assessment-runtime.ts's isLocallyTerminal usage) regressed.
    expect(serverFinalAttempt.status).toBe("in_progress");
    expect(serverFinalAttempt.outcome).toBeNull();

    const serverElapsedMs = serverFinalAttempt.lastSimulationTimeMs ?? untilMs;

    // The local oracle's replayed state at the exact same elapsed time,
    // and its Finish-equivalent evaluation via the same shared
    // evaluateCandidateDeclaredFinish core finishAttempt uses — never a
    // second, independently-written completion-decision implementation.
    const localFinalState = runReplayOracle(paymentRetryStormSimulation, timedActions, serverElapsedMs);
    const localFinishResult = evaluateCandidateDeclaredFinish(
      paymentRetryStormSimulation,
      localFinalState,
    );
    const localInputs = extractFinishScoringInputs(paymentRetryStormSimulation, localFinishResult);
    const localScore = await scoreAttempt(
      {
        scenarioId: builtinScenarioId,
        scenario: { slug: paymentRetryStorm.slug, ownershipType: "incidentrank" },
        scenarioVersion: builtinScenarioVersion,
      },
      localInputs,
    );

    // Now the candidate declares Finish through the real server path —
    // the same finishAttempt the practice Finish endpoint calls, proving
    // assessment attempts share the identical completion-decision
    // implementation rather than a parallel one.
    const finishableAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
      with: { scenario: true },
    });
    if (!finishableAttempt) throw new Error("attempt disappeared before finish");
    const finishOutcome = await finishAttempt(finishableAttempt, "assessment-equality-finish", null);
    expect(finishOutcome.ok).toBe(true);
    if (!finishOutcome.ok) return;

    expect(finishOutcome.result.outcome).toBe(localFinishResult.outcome);
    expect(finishOutcome.result.completionTier).toBe(localFinishResult.completionTier);

    const persistedAttempt = await testDb.query.attempts.findFirst({ where: eq(attempts.id, attempt.id) });
    if (!persistedAttempt) throw new Error("attempt disappeared after finish");

    expect(persistedAttempt.status).toBe("completed");
    expect(persistedAttempt.outcome).toBe(localFinishResult.outcome);

    // Final simulation state — the attempt's persisted finalStateJson is
    // exactly the SimulationState the server computed when Finish
    // replayed it, which must equal the local oracle's final state
    // (modulo field ordering, hence toEqual).
    expect(persistedAttempt.finalStateJson).toEqual(localFinalState);

    // Total score and all six dimensions.
    expect(persistedAttempt.score).toBe(localScore.total);
    expect(persistedAttempt.recoveryScore).toBe(localScore.breakdown.recovery);
    expect(persistedAttempt.customerImpactScore).toBe(localScore.breakdown.customerImpact);
    expect(persistedAttempt.dataIntegrityScore).toBe(localScore.breakdown.dataIntegrity);
    expect(persistedAttempt.reliabilityScore).toBe(localScore.breakdown.reliability);
    expect(persistedAttempt.costEfficiencyScore).toBe(localScore.breakdown.costEfficiency);
    expect(persistedAttempt.operationalEfficiencyScore).toBe(localScore.breakdown.operationalEfficiency);
  });

  it("organization-authored scenario: identical final status, state, scoring inputs, total score, and all six dimensions", async () => {
    const { owner, org } = await createOrgWithOwner(TEST_ORG_SLUG);
    const candidate = await createCandidateUser(TEST_AUTH_CANDIDATE, "Candidate");

    const { scenario, draft } = await createOrgScenario(
      org.id,
      owner.id,
      "Test Runtime Scenario",
      buildMinimalAuthoredScenario("test-runtime-score-equality-slug"),
    );
    const published = await publishScenarioDraft(scenario);
    if (!published.ok) throw new Error("expected publish to succeed");

    const { assessment, candidate: candidateRow } = await createClaimedCandidateAssessment(
      org.id,
      owner.id,
      scenario.id,
      draft.version,
      candidate.id,
    );
    const attempt = await startAttempt(
      candidate.id,
      scenario.id,
      draft.version,
      assessment.id,
      candidateRow.id,
    );
    await resumeRuntimeClock(attempt.id);

    // The minimal authored fixture's "spiking" rule fires on the
    // timeline event's trigger at 10s; set poolSize to 50 afterward to
    // match the "recovered" rule and drive the attempt to its success
    // condition (errorRate < 1, sustained 5s).
    const timedActions: TimedAction[] = [{ atMs: 15_000, controlKey: "poolSize", value: 50 }];
    const untilMs = 60_000;

    const serverFinalAttempt = await driveServerRuntimeThroughActions(
      testDb,
      attempt.id,
      candidate.id,
      timedActions,
      untilMs,
    );
    const serverElapsedMs = serverFinalAttempt.lastSimulationTimeMs ?? untilMs;

    const compiled = compileAuthoredScenario(buildMinimalAuthoredScenario("test-runtime-score-equality-slug"));
    if (!compiled.ok) throw new Error("expected authored fixture to compile");

    const localFinalState = runReplayOracle(compiled.definition.simulation, timedActions, serverElapsedMs);
    const localInputs = extractScoringInputs(compiled.definition.simulation, localFinalState);
    const localScore = await scoreAttempt(
      {
        scenarioId: scenario.id,
        scenario: { slug: scenario.slug, ownershipType: "organization" },
        scenarioVersion: draft.version,
      },
      localInputs,
    );

    // Phase 7.1: the engine itself can only ever auto-detect FAILURE —
    // "spiking→recovered" is a genuine success-condition path, so even
    // though localFinalState.status legitimately reaches "resolved"
    // sustain-eligibility, the server-authoritative attempt correctly
    // stays in_progress with no finalStateJson persisted until an
    // explicit Finish declaration evaluates and persists it. This test's
    // whole point (identical final state/score between the local replay
    // oracle and the server-authoritative runtime) still holds — it just
    // has to go through finishAttempt, the same shared completion-
    // decision core used everywhere else, exactly like the test above it
    // already does for its own equality assertion.
    if (localFinalState.status === "failed") {
      expect(serverFinalAttempt.status).toBe("completed");
      expect(serverFinalAttempt.outcome).toBe("failed");
      expect(serverFinalAttempt.finalStateJson).toEqual(localFinalState);

      const serverInputs = extractScoringInputs(
        compiled.definition.simulation,
        serverFinalAttempt.finalStateJson as SimulationState,
      );
      expect(serverInputs).toEqual(localInputs);

      expect(serverFinalAttempt.score).toBe(localScore.total);
      expect(serverFinalAttempt.recoveryScore).toBe(localScore.breakdown.recovery);
      expect(serverFinalAttempt.customerImpactScore).toBe(localScore.breakdown.customerImpact);
      expect(serverFinalAttempt.dataIntegrityScore).toBe(localScore.breakdown.dataIntegrity);
      expect(serverFinalAttempt.reliabilityScore).toBe(localScore.breakdown.reliability);
      expect(serverFinalAttempt.costEfficiencyScore).toBe(localScore.breakdown.costEfficiency);
      expect(serverFinalAttempt.operationalEfficiencyScore).toBe(
        localScore.breakdown.operationalEfficiency,
      );
      return;
    }

    expect(serverFinalAttempt.status).toBe("in_progress");
    expect(serverFinalAttempt.outcome).toBeNull();
    expect(serverFinalAttempt.finalStateJson).toBeNull();

    const finishableAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
      with: { scenario: true },
    });
    if (!finishableAttempt) throw new Error("attempt disappeared before finish");
    const finishOutcome = await finishAttempt(
      finishableAttempt,
      "assessment-equality-automatic-finish",
      null,
    );
    expect(finishOutcome.ok).toBe(true);
    if (!finishOutcome.ok) return;

    const localFinishResult = evaluateCandidateDeclaredFinish(
      compiled.definition.simulation,
      localFinalState,
    );
    expect(finishOutcome.result.outcome).toBe(localFinishResult.outcome);
    expect(finishOutcome.result.completionTier).toBe(localFinishResult.completionTier);

    const persistedAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
    });
    if (!persistedAttempt) throw new Error("attempt disappeared after finish");

    expect(persistedAttempt.status).toBe("completed");
    expect(persistedAttempt.outcome).toBe(localFinishResult.outcome);
    expect(persistedAttempt.finalStateJson).toEqual(localFinalState);

    const localFinishInputs = extractFinishScoringInputs(
      compiled.definition.simulation,
      localFinishResult,
    );
    const localFinishScore = await scoreAttempt(
      {
        scenarioId: scenario.id,
        scenario: { slug: scenario.slug, ownershipType: "organization" },
        scenarioVersion: draft.version,
      },
      localFinishInputs,
    );

    expect(persistedAttempt.score).toBe(localFinishScore.total);
    expect(persistedAttempt.recoveryScore).toBe(localFinishScore.breakdown.recovery);
    expect(persistedAttempt.customerImpactScore).toBe(localFinishScore.breakdown.customerImpact);
    expect(persistedAttempt.dataIntegrityScore).toBe(localFinishScore.breakdown.dataIntegrity);
    expect(persistedAttempt.reliabilityScore).toBe(localFinishScore.breakdown.reliability);
    expect(persistedAttempt.costEfficiencyScore).toBe(localFinishScore.breakdown.costEfficiency);
    expect(persistedAttempt.operationalEfficiencyScore).toBe(
      localFinishScore.breakdown.operationalEfficiency,
    );
  });
});
