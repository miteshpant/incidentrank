import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  attemptActionGroups,
  attemptActionChanges,
  attempts,
  organizations,
  organizationMembers,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { createOrgScenario, publishScenarioDraft } from "./scenario-authoring";
import { reviewPracticeAttemptFeedback } from "./action-feedback";
import { finishAttempt } from "./finish-attempt";

/**
 * Integration tests against local Postgres for Phase 6.1's "Post-Incident
 * Practice Explanation" (docs/implementation_plan/phase6.1.md): covers
 * the required leak-boundary behavior — practice-only, terminal-only,
 * never assessments — and correct per-action feedback resolution via
 * reviewAttempt's independent server-side replay+reclassify.
 */

let testDb: Db;

const TEST_AUTH_OWNER = "test-review-owner";
const TEST_AUTH_USER = "test-review-user";
const TEST_ORG_SLUG = "test-review-acme";

beforeAll(() => {
  testDb = createDb();
});

afterEach(async () => {
  const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
  if (user) {
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_USER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

/**
 * A minimal candidate_declared scenario whose actionClassifications
 * carry authored feedback — mitigationLevel=2 is beneficial with
 * feedback ONLY once the incident is active (whenTriggerEquals), proving
 * review resolves feedback against the triggers active at the time of
 * the action, not final state. mitigationLevel=1's rule has no feedback
 * authored at all (missing is valid).
 */
function buildReviewableScenario(slug: string): AuthoredScenario {
  return {
    schemaVersion: 1,
    basics: {
      name: "Test Review Scenario",
      slug,
      description: "A minimal candidate-declared scenario for review endpoint testing.",
      difficulty: "intermediate",
      estimatedMinutes: 10,
    },
    architecture: { nodes: [{ id: "api", label: "API", type: "service" }], edges: [] },
    controls: [
      {
        key: "mitigationLevel",
        label: "Mitigation Level",
        type: "select",
        allowedValues: [0, 1, 2],
        initialValue: 0,
        componentId: "api",
      },
    ],
    initialState: { errorRate: 12 },
    metrics: [
      { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
    ],
    timelineEvents: [
      {
        id: "incident-begins",
        atSeconds: 5,
        label: "Incident begins",
        message: "Incident begins.",
        setTriggers: { incidentActive: true },
      },
    ],
    rules: [
      {
        id: "optimal",
        when: [
          { source: "trigger", key: "incidentActive", equals: true },
          { source: "control", key: "mitigationLevel", operator: "equals", comparedTo: 2 },
        ],
        incidentState: "recovering",
        setValues: { errorRate: 0.2 },
      },
      {
        id: "acceptable",
        when: [
          { source: "trigger", key: "incidentActive", equals: true },
          { source: "control", key: "mitigationLevel", operator: "equals", comparedTo: 1 },
        ],
        incidentState: "stabilized-acceptable",
        setValues: { errorRate: 3 },
      },
      {
        id: "baseline",
        when: [{ source: "trigger", key: "incidentActive", equals: true }],
        incidentState: "critical",
        setValues: { errorRate: 60 },
      },
      {
        id: "healthy",
        when: [],
        incidentState: "healthy",
        setValues: { errorRate: 0.1 },
      },
    ],
    successCondition: {
      conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 1 }],
      sustainedSeconds: 5,
    },
    failureCondition: {
      conditions: [{ key: "errorRate", operator: "greater_than_or_equal", comparedTo: 50 }],
      sustainedSeconds: 10,
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
    completion: { mode: "candidate_declared" },
    actionClassifications: [
      {
        id: "mitigation-optimal-beneficial",
        controlKey: "mitigationLevel",
        valueEquals: 2,
        whenTriggerEquals: { incidentActive: true },
        outcome: "beneficial",
        feedback: {
          title: "Applied the full mitigation",
          explanation: "Setting mitigation to its highest level resolved the incident cleanly.",
        },
      },
      {
        // No feedback authored — missing is valid.
        controlKey: "mitigationLevel",
        valueEquals: 1,
        whenTriggerEquals: { incidentActive: true },
        outcome: "beneficial",
      },
    ],
  };
}

async function setup() {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_USER, displayName: "User" })
    .returning();
  if (!owner || !user) throw new Error("fixtures not created");

  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Review Test Acme", slug: TEST_ORG_SLUG })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: owner.id, role: "owner" });

  const slug = `test-review-scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { scenario } = await createOrgScenario(
    org.id,
    owner.id,
    "Test Review Scenario",
    buildReviewableScenario(slug),
  );
  const published = await publishScenarioDraft(scenario);
  if (!published.ok) throw new Error(`publish failed: ${JSON.stringify(published)}`);

  return { user, scenario };
}

async function startAttempt(
  userId: string,
  scenarioId: string,
  scenarioVersion: number,
  attemptType: "practice" | "assessment" = "practice",
) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({ userId, scenarioId, scenarioVersion, attemptType, status: "in_progress" })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

async function applyMitigation(attemptId: string, elapsedMs: number, mitigationLevel: number, sequence: number) {
  const [group] = await testDb
    .insert(attemptActionGroups)
    .values({ attemptId, sequence, elapsedMs })
    .returning();
  if (!group) throw new Error("group not created");
  await testDb.insert(attemptActionChanges).values({
    actionGroupId: group.id,
    sequence: 0,
    controlKey: "mitigationLevel",
    previousValueJson: 0,
    newValueJson: mitigationLevel,
  });
}

async function loadReviewable(attemptId: string) {
  const row = await testDb.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { scenario: true },
  });
  if (!row) throw new Error("attempt not found");
  return row;
}

describe("reviewPracticeAttemptFeedback", () => {
  it("rejects a not-yet-terminal attempt — feedback is a post-completion reveal only", async () => {
    const { user, scenario } = await setup();
    const attempt = await startAttempt(user.id, scenario.id, 1);
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));

    const reviewable = await loadReviewable(attempt.id);
    const result = await reviewPracticeAttemptFeedback(reviewable);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_terminal");
  });

  it("rejects an assessment attempt even after it is terminal — feedback is practice-only", async () => {
    const { user, scenario } = await setup();
    const attempt = await startAttempt(user.id, scenario.id, 1, "assessment");
    await testDb
      .update(attempts)
      .set({ status: "completed", outcome: "resolved", completedAt: new Date() })
      .where(eq(attempts.id, attempt.id));

    const reviewable = await loadReviewable(attempt.id);
    const result = await reviewPracticeAttemptFeedback(reviewable);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not_practice");
  });

  it("resolves authored feedback for a terminal practice attempt, keyed to the matched rule", async () => {
    const { user, scenario } = await setup();
    const attempt = await startAttempt(user.id, scenario.id, 1);
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));

    const reviewable = await loadReviewable(attempt.id);
    const finishResult = await finishAttempt(reviewable, "req-review-1", null);
    expect(finishResult.ok).toBe(true);

    const terminal = await loadReviewable(attempt.id);
    const result = await reviewPracticeAttemptFeedback(terminal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.actionGroups).toHaveLength(1);
    const change = result.actionGroups[0]!.changes[0]!;
    expect(change.outcome).toBe("beneficial");
    expect(change.feedback).toEqual({
      title: "Applied the full mitigation",
      explanation: "Setting mitigation to its highest level resolved the incident cleanly.",
    });
  });

  it("missing feedback on a matched rule resolves as null, never fabricated", async () => {
    const { user, scenario } = await setup();
    const attempt = await startAttempt(user.id, scenario.id, 1);
    await applyMitigation(attempt.id, 6_000, 1, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 10_000 }).where(eq(attempts.id, attempt.id));

    const reviewable = await loadReviewable(attempt.id);
    const finishResult = await finishAttempt(reviewable, "req-review-2", null);
    expect(finishResult.ok).toBe(true);

    const terminal = await loadReviewable(attempt.id);
    const result = await reviewPracticeAttemptFeedback(terminal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const change = result.actionGroups[0]!.changes[0]!;
    expect(change.outcome).toBe("beneficial");
    expect(change.feedback).toBeNull();
  });

  it("the returned DTO never carries a matchedRuleId or any other hidden-logic field", async () => {
    const { user, scenario } = await setup();
    const attempt = await startAttempt(user.id, scenario.id, 1);
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));

    const reviewable = await loadReviewable(attempt.id);
    await finishAttempt(reviewable, "req-review-3", null);

    const terminal = await loadReviewable(attempt.id);
    const result = await reviewPracticeAttemptFeedback(terminal);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const change = result.actionGroups[0]!.changes[0]!;
    expect(Object.keys(change).sort()).toEqual(
      ["controlKey", "feedback", "newValue", "outcome", "previousValue"].sort(),
    );
  });
});
