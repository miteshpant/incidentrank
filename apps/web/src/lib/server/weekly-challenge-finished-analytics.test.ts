import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  analyticsEvents,
  attemptActionGroups,
  attemptActionChanges,
  attempts,
  challenges,
  organizations,
  organizationMembers,
  users,
  weeklyChallenges,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { createOrgScenario, publishScenarioDraft } from "./scenario-authoring";
import { finishAttempt } from "./finish-attempt";
import { createChallenge, acceptChallenge } from "./challenge";

/**
 * docs/implementation_plan/phase-challege-version.md §12 — regression
 * coverage for a real gap the user caught live: weekly_challenge_finished
 * and challenge_finished were declared in the analytics vocabulary but
 * nothing ever called recordAnalyticsEvent for them, so "Finishes" always
 * read 0 in the admin stats despite real completions. Mirrors
 * finish-attempt.test.ts's exact fixture shape (a minimal
 * candidate_declared org-authored scenario + the real finishAttempt
 * entry point), kept in its own file rather than appended to that
 * already-large, stable file.
 */
let testDb: Db;

const TEST_AUTH_OWNER = "test-wc-finished-owner";
const TEST_AUTH_USER = "test-wc-finished-user";
const TEST_AUTH_USER_2 = "test-wc-finished-user-2";
const TEST_ORG_SLUG = "test-wc-finished-acme";

beforeAll(() => {
  testDb = createDb();
});

afterEach(async () => {
  for (const authId of [TEST_AUTH_USER, TEST_AUTH_USER_2]) {
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
    if (user) {
      await testDb.delete(challenges).where(eq(challenges.challengerUserId, user.id));
      await testDb.delete(analyticsEvents).where(eq(analyticsEvents.userId, user.id));
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    }
  }
  const scenarioOwner = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_OWNER) });
  if (scenarioOwner) {
    const org = await testDb.query.organizations.findFirst({ where: eq(organizations.slug, TEST_ORG_SLUG) });
    if (org) {
      await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.createdByUserId, scenarioOwner.id));
    }
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(like(users.authProviderId, "test-wc-finished-%"));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

function buildScenario(slug: string): AuthoredScenario {
  return {
    schemaVersion: 1,
    basics: {
      name: "Test WC Finished Scenario",
      slug,
      description: "A minimal candidate-declared scenario for Weekly Challenge analytics testing.",
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
        {
          dimension: "recovery",
          maxPoints: 300,
          terminalOverrides: { failed: 0, unresolved: 0 },
          bands: [{ points: 300 }],
        },
        { dimension: "customerImpact", maxPoints: 200, bands: [{ points: 200 }] },
        { dimension: "dataIntegrity", maxPoints: 200, bands: [{ points: 200 }] },
        {
          dimension: "reliability",
          maxPoints: 150,
          terminalOverrides: { failed: 0, unresolved: 0 },
          bands: [{ points: 150 }],
        },
        { dimension: "costEfficiency", maxPoints: 100, bands: [{ points: 100 }] },
        { dimension: "operationalEfficiency", maxPoints: 50, bands: [{ points: 50 }] },
      ],
    },
    completion: {
      mode: "candidate_declared",
      acceptableCondition: {
        conditions: [{ key: "errorRate", operator: "less_than", comparedTo: 5 }],
        sustainedSeconds: 3,
      },
    },
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
    .values({ name: "WC Finished Test Acme", slug: TEST_ORG_SLUG })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: owner.id, role: "owner" });

  const slug = `test-wc-finished-scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { scenario } = await createOrgScenario(org.id, owner.id, "Test WC Finished Scenario", buildScenario(slug));
  const published = await publishScenarioDraft(scenario);
  if (!published.ok) throw new Error(`publish failed: ${JSON.stringify(published)}`);

  return { owner, user, scenario };
}

async function startPracticeAttempt(
  userId: string,
  scenarioId: string,
  scenarioVersion: number,
  weeklyChallengeId: string | null = null,
) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({ userId, scenarioId, scenarioVersion, attemptType: "practice", status: "in_progress", weeklyChallengeId })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

async function stabilizeAndFinish(attemptId: string) {
  const [group] = await testDb
    .insert(attemptActionGroups)
    .values({ attemptId, sequence: 0, elapsedMs: 6_000 })
    .returning();
  if (!group) throw new Error("group not created");
  await testDb.insert(attemptActionChanges).values({
    actionGroupId: group.id,
    sequence: 0,
    controlKey: "mitigationLevel",
    previousValueJson: 0,
    newValueJson: 2,
  });
  await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attemptId));

  const finishable = await testDb.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { scenario: true },
  });
  if (!finishable) throw new Error("attempt not found");
  return finishAttempt(finishable, `req-${attemptId}`, null);
}

describe("weekly_challenge_finished / challenge_finished analytics", () => {
  it("fires weekly_challenge_finished when a weekly-challenge-tagged attempt finishes", async () => {
    const { owner, user, scenario } = await setup();
    // active: false — this test only needs the attempt's weeklyChallengeId
    // to reference a real row (recordAnalyticsEvent fires off that FK,
    // never off `active`, since a challenge may have already rotated away
    // by the time its attempt finishes); using false also avoids
    // colliding with weekly_challenges_one_active_idx if some other
    // active challenge already exists in this shared local DB.
    const [wc] = await testDb
      .insert(weeklyChallenges)
      .values({ scenarioId: scenario.id, createdByUserId: owner.id, active: false })
      .returning();
    if (!wc) throw new Error("weekly challenge not created");

    const attempt = await startPracticeAttempt(user.id, scenario.id, 1, wc.id);
    const result = await stabilizeAndFinish(attempt.id);
    expect(result.ok).toBe(true);

    const events = await testDb.query.analyticsEvents.findMany({
      where: eq(analyticsEvents.userId, user.id),
    });
    expect(events.some((e) => e.eventName === "weekly_challenge_finished")).toBe(true);

    await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.id, wc.id));
  });

  it("does not fire weekly_challenge_finished for a normal (non-challenge) attempt", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    const result = await stabilizeAndFinish(attempt.id);
    expect(result.ok).toBe(true);

    const events = await testDb.query.analyticsEvents.findMany({
      where: eq(analyticsEvents.userId, user.id),
    });
    expect(events.some((e) => e.eventName === "weekly_challenge_finished")).toBe(false);
  });

  it("fires challenge_finished when the challenged engineer's attempt finishes", async () => {
    const { user, scenario } = await setup();
    const [challenged] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_USER_2, displayName: "Challenged" })
      .returning();
    if (!challenged) throw new Error("second user not created");

    const challengerAttempt = await startPracticeAttempt(user.id, scenario.id, 1);
    await testDb
      .update(attempts)
      .set({ status: "completed", outcome: "resolved", score: 900 })
      .where(eq(attempts.id, challengerAttempt.id));

    const created = await createChallenge(user.id, challengerAttempt.id);
    if (!created.ok) throw new Error("challenge not created");
    await acceptChallenge(created.token, challenged.id);

    const challengedAttempt = await startPracticeAttempt(challenged.id, scenario.id, 1);
    const result = await stabilizeAndFinish(challengedAttempt.id);
    expect(result.ok).toBe(true);

    const events = await testDb.query.analyticsEvents.findMany({
      where: eq(analyticsEvents.userId, challenged.id),
    });
    expect(events.some((e) => e.eventName === "challenge_finished")).toBe(true);
  });
});
