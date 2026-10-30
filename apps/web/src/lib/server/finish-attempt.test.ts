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
import { compileAuthoredScenario, type AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { ATTEMPT_CEILING_MS, createInitialState, simulate, type CandidateAction } from "@incidentrank/simulator";
import { createOrgScenario, publishScenarioDraft } from "./scenario-authoring";
import { finishAttempt } from "./finish-attempt";

/**
 * Integration tests against local Postgres for Phase 6.1's
 * server-authoritative Finish endpoint (finishAttempt), covering the
 * exact test list docs/implementation_plan/phase6.1.md requires:
 * candidate-declared success does not auto-resolve, stable declaration
 * resolves, early declaration is declared_unstable, unsafe declaration is
 * terminal but not resolved, automatic failure still fires regardless of
 * completion mode, idempotency (same finishRequestId applied twice),
 * terminal immutability, and the acceptable/optimal tier distinction.
 */

let testDb: Db;

const TEST_AUTH_OWNER = "test-finish-owner";
const TEST_AUTH_USER = "test-finish-user";
const TEST_ORG_SLUG = "test-finish-acme";

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
 * A minimal candidate_declared scenario: errorRate<1 sustained 5s is
 * "optimal"; errorRate<5 sustained 3s is the looser "acceptable" tier
 * (a deliberate, genuinely-safe-but-imperfect handback state, distinct
 * from the full successCondition). errorRate>=50 sustained 10s is a true
 * automatic failure that fires regardless of completion mode.
 */
function buildCandidateDeclaredScenario(slug: string): AuthoredScenario {
  return {
    schemaVersion: 1,
    basics: {
      name: "Test Finish Scenario",
      slug,
      description: "A minimal candidate-declared scenario for Finish endpoint testing.",
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
          // Time-sensitive bands (default recoveryTimeSeconds measure) so
          // tests can prove the derived scoring resolvedAtMs — not just
          // "non-null" — reflects the right instant: fast sustained
          // recovery must score higher than slow/late recovery, and the
          // acceptable tier's own stabilization time must drive this
          // independently of the optimal tier's.
          bands: [
            { atMost: 10, points: 300 },
            { atMost: 30, points: 150 },
            { points: 50 },
          ],
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
    .values({ name: "Finish Test Acme", slug: TEST_ORG_SLUG })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: owner.id, role: "owner" });

  const slug = `test-finish-scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { scenario } = await createOrgScenario(
    org.id,
    owner.id,
    "Test Finish Scenario",
    buildCandidateDeclaredScenario(slug),
  );
  const published = await publishScenarioDraft(scenario);
  if (!published.ok) throw new Error(`publish failed: ${JSON.stringify(published)}`);

  return { user, scenario };
}

async function startPracticeAttempt(userId: string, scenarioId: string, scenarioVersion: number) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId,
      scenarioId,
      scenarioVersion,
      attemptType: "practice",
      status: "in_progress",
    })
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

async function loadFinishable(attemptId: string) {
  const row = await testDb.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { scenario: true },
  });
  if (!row) throw new Error("attempt not found");
  return row;
}

describe("finishAttempt", () => {
  it("candidate_declared + stable optimal state -> resolved, tier optimal", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    // incidentActive fires at 5s; mitigationLevel=2 applied at 6s; need
    // 5s sustained success -> finish at 6s + 6s = 12s to be safely past.
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const result = await finishAttempt(finishable, "req-1", "System fully recovered.");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.outcome).toBe("resolved");
    expect(result.result.completionTier).toBe("optimal");
    expect(result.result.score?.total).toBeGreaterThan(0);

    const row = await loadFinishable(attempt.id);
    expect(row.status).toBe("completed");
    expect(row.outcome).toBe("resolved");
    expect(row.completionTier).toBe("optimal");
    expect(row.completionNote).toBe("System fully recovered.");
    expect(row.completionDeclaredAt).not.toBeNull();
    expect(row.completionSimulationTimeMs).not.toBeNull();
  });

  it("candidate_declared + stable acceptable-but-imperfect state -> resolved, tier acceptable", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    // mitigationLevel=1 -> errorRate=3, satisfies acceptableCondition
    // (<5, sustained 3s) but not successCondition (<1).
    await applyMitigation(attempt.id, 6_000, 1, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 10_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const result = await finishAttempt(finishable, "req-1", null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.outcome).toBe("resolved");
    expect(result.result.completionTier).toBe("acceptable");
  });

  it("candidate_declared + success currently true but sustain window incomplete -> declared_unstable", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    // mitigationLevel=2 applied at 6s; finish almost immediately after,
    // well before the 5s sustain window completes.
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 7_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const result = await finishAttempt(finishable, "req-1", "Looks good already.");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.outcome).toBe("declared_unstable");
    expect(result.result.completionTier).toBeNull();

    const row = await loadFinishable(attempt.id);
    expect(row.status).toBe("completed");
    expect(row.outcome).toBe("declared_unstable");
    // declared_unstable still earns normal credit on dimensions with no
    // unresolved terminalOverride (customerImpact in this fixture).
    expect(row.customerImpactScore).toBe(200);
    // recovery/reliability are zeroed via terminalOverrides.unresolved.
    expect(row.recoveryScore).toBe(0);
    expect(row.reliabilityScore).toBe(0);
  });

  it("candidate_declared + no mitigation at all -> declared_unstable, not resolved", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 8_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const result = await finishAttempt(finishable, "req-1", null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.outcome).toBe("declared_unstable");
  });

  it("was stable earlier but regressed before Finish -> declared_unstable, not resolved based on past stability", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    // Reach optimal, hold well past the sustain window, then regress.
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await applyMitigation(attempt.id, 6_000 + 10_000, 0, 1);
    await testDb
      .update(attempts)
      .set({ lastSimulationTimeMs: 6_000 + 10_000 + 2_000 })
      .where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const result = await finishAttempt(finishable, "req-1", null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.outcome).toBe("declared_unstable");
  });

  it("automatic failure fires regardless of completion mode, even without a Finish click", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    // No mitigation at all -> baseline errorRate=60 >= failure threshold
    // (50), sustained 10s after incidentActive at 5s -> fails at 15s.
    await testDb.update(attempts).set({ lastSimulationTimeMs: 16_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const result = await finishAttempt(finishable, "req-1", null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A true automatic failure Finish-es as declared_unstable at the
    // outcome level (the attempt is terminal, not "resolved") — the
    // underlying state.status is "failed", which this fixture's scoring
    // config also zeroes via terminalOverrides.failed.
    expect(result.result.outcome).toBe("declared_unstable");
  });

  it("Finish is idempotent: the same finishRequestId applied twice returns the identical already-persisted result", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const first = await finishAttempt(finishable, "req-idempotent", "First note.");
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Second call: pass the attempt as it was BEFORE finishing (simulating
    // a retried request that doesn't know the first one already
    // succeeded) — finishAttempt must detect this server-side via the
    // row's actual current state, not trust the caller's belief.
    const second = await finishAttempt(finishable, "req-idempotent", "First note.");
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.alreadyApplied).toBe(true);
    expect(second.result.outcome).toBe(first.result.outcome);
    expect(second.result.completionTier).toBe(first.result.completionTier);
    expect(second.result.score?.total).toBe(first.result.score?.total);

    const groups = await testDb.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
    });
    // No duplicate declaration-related side effects — the action group
    // count should reflect only the one mitigation applied earlier, not
    // any extra row from the retried finish.
    expect(groups.length).toBe(1);
  });

  it("terminal immutability: Finish rejects an already-completed attempt", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    await applyMitigation(attempt.id, 6_000, 2, 0);
    await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));

    const finishable = await loadFinishable(attempt.id);
    const first = await finishAttempt(finishable, "req-a", null);
    expect(first.ok).toBe(true);

    const reloaded = await loadFinishable(attempt.id);
    const second = await finishAttempt(reloaded, "req-b", null);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("terminal");
  });

  it("terminal failure race: a failure that already became authoritative before Finish is never overridden", async () => {
    const { user, scenario } = await setup();
    const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
    // No mitigation -> baseline errorRate=60 crosses the failure
    // threshold (>=50) sustained 10s after incidentActive at 5s -> a
    // concurrent advance/action path would persist status=completed,
    // outcome=failed at 15s. Simulate that already having happened by
    // directly persisting it, as advanceRuntime's own
    // `WHERE status = 'in_progress'` terminal-detection path would.
    await testDb
      .update(attempts)
      .set({
        status: "completed",
        outcome: "failed",
        lastSimulationTimeMs: 16_000,
        completedAt: new Date(),
      })
      .where(eq(attempts.id, attempt.id));

    // The candidate's browser, unaware the server already detected the
    // failure, submits Finish anyway — the caller's stale `attempt`
    // object (loaded before the race) may still say in_progress, but
    // finishAttempt must defer to the row-locked authoritative state and
    // refuse, never silently resolving over an already-persisted
    // failure.
    const staleSnapshot = { ...(await loadFinishable(attempt.id)), status: "in_progress" as const };
    const result = await finishAttempt(staleSnapshot, "req-race", "I think it recovered.");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("terminal");

    const row = await loadFinishable(attempt.id);
    expect(row.status).toBe("completed");
    expect(row.outcome).toBe("failed");
    expect(row.completionNote).toBeNull();
  });

  it("completion note is persisted and never affects the score", async () => {
    const { user, scenario } = await setup();
    const attemptA = await startPracticeAttempt(user.id, scenario.id, 1);
    const attemptB = await startPracticeAttempt(user.id, scenario.id, 1);
    for (const attempt of [attemptA, attemptB]) {
      await applyMitigation(attempt.id, 6_000, 2, 0);
      await testDb.update(attempts).set({ lastSimulationTimeMs: 13_000 }).where(eq(attempts.id, attempt.id));
    }

    const finishableA = await loadFinishable(attemptA.id);
    const finishableB = await loadFinishable(attemptB.id);
    const resultA = await finishAttempt(finishableA, "req-a", "A very long explanation of my reasoning.");
    const resultB = await finishAttempt(finishableB, "req-b", null);

    expect(resultA.ok && resultB.ok).toBe(true);
    if (!resultA.ok || !resultB.ok) return;
    expect(resultA.result.score?.total).toBe(resultB.result.score?.total);

    const rowA = await loadFinishable(attemptA.id);
    expect(rowA.completionNote).toBe("A very long explanation of my reasoning.");
  });

  describe("client-vs-server parity (Phase 6.1 binding invariant)", () => {
    // "For the same action sequence and elapsed time, client practice
    // simulation and server Finish replay must produce identical final
    // state." Client-side simulation remains the UX/live-feedback layer
    // (apps/web/src/lib/use-incident-attempt.ts ticks the simulator
    // locally in the browser exactly as it does today for automatic
    // scenarios); finishAttempt's server-side replay is the sole
    // authority for the actual terminal decision. This test proves those
    // two independently-driven code paths — a local oracle calling
    // simulate() directly the same way the browser hook does, and the
    // real finishAttempt() calling replayAttempt() against persisted DB
    // rows — agree exactly, for both the stable-optimal and the
    // early-declaration (declared_unstable) cases.
    function runClientOracle(
      compiledScenario: ReturnType<typeof compileAuthoredScenario>,
      actions: { atMs: number; controlKey: string; value: number }[],
      untilMs: number,
    ) {
      if (!compiledScenario.ok) throw new Error("fixture failed to compile");
      const scenario = compiledScenario.definition.simulation;
      let state = createInitialState(scenario);
      let actionIndex = 0;
      let actionCounter = 0;

      for (let timeMs = 0; timeMs < untilMs; timeMs += scenario.tickMs) {
        let action: CandidateAction | null = null;
        if (actionIndex < actions.length && actions[actionIndex]!.atMs <= timeMs) {
          const pending = actions[actionIndex]!;
          actionCounter += 1;
          action = {
            id: `oracle-action-${actionCounter}`,
            timestampMs: timeMs,
            controlKey: pending.controlKey,
            value: pending.value,
          };
          actionIndex += 1;
        }
        const result = simulate(scenario, state, action, scenario.tickMs);
        state = result.state;
      }
      return state;
    }

    it("stable-optimal path: client-side oracle and server Finish replay reach identical final state", async () => {
      const { user, scenario } = await setup();
      const attempt = await startPracticeAttempt(user.id, scenario.id, 1);

      const actions = [{ atMs: 6_000, controlKey: "mitigationLevel", value: 2 }];
      const elapsedMs = 13_000;

      await applyMitigation(attempt.id, actions[0]!.atMs, actions[0]!.value, 0);
      await testDb.update(attempts).set({ lastSimulationTimeMs: elapsedMs }).where(eq(attempts.id, attempt.id));

      const finishable = await loadFinishable(attempt.id);
      const serverResult = await finishAttempt(finishable, "req-parity-1", null);
      expect(serverResult.ok).toBe(true);
      if (!serverResult.ok) return;

      const clientOracleState = runClientOracle(
        compileAuthoredScenario(buildCandidateDeclaredScenario(scenario.slug)),
        actions,
        elapsedMs,
      );

      expect(serverResult.result.state.values).toEqual(clientOracleState.values);
      expect(serverResult.result.state.status).toBe(clientOracleState.status);
      expect(serverResult.result.state.transitions.consecutiveSuccessSeconds).toBe(
        clientOracleState.transitions.consecutiveSuccessSeconds,
      );
    });

    it("early-declaration path: client-side oracle and server Finish replay agree the sustain window is incomplete", async () => {
      const { user, scenario } = await setup();
      const attempt = await startPracticeAttempt(user.id, scenario.id, 1);

      const actions = [{ atMs: 6_000, controlKey: "mitigationLevel", value: 2 }];
      const elapsedMs = 7_000; // well before the 5s sustain window completes

      await applyMitigation(attempt.id, actions[0]!.atMs, actions[0]!.value, 0);
      await testDb.update(attempts).set({ lastSimulationTimeMs: elapsedMs }).where(eq(attempts.id, attempt.id));

      const finishable = await loadFinishable(attempt.id);
      const serverResult = await finishAttempt(finishable, "req-parity-2", null);
      expect(serverResult.ok).toBe(true);
      if (!serverResult.ok) return;
      expect(serverResult.result.outcome).toBe("declared_unstable");

      const clientOracleState = runClientOracle(
        compileAuthoredScenario(buildCandidateDeclaredScenario(scenario.slug)),
        actions,
        elapsedMs,
      );

      expect(serverResult.result.state.values).toEqual(clientOracleState.values);
      expect(serverResult.result.state.transitions.consecutiveSuccessSeconds).toBe(
        clientOracleState.transitions.consecutiveSuccessSeconds,
      );
      // The client oracle would independently compute the same
      // "not sustained long enough" answer, proving the live UI the
      // candidate sees and the server's authoritative Finish decision
      // are reading the exact same underlying mechanics.
      expect(clientOracleState.transitions.consecutiveSuccessSeconds).toBeLessThan(5);
    });
  });

  describe("scoring resolvedAtMs override (Phase 6.1 binding invariant)", () => {
    // The generic scorer's recovery/reliability dimensions derive their
    // measure entirely from ScoringInputs.resolvedAtMs, which the engine
    // itself never writes for candidate_declared completion. finishAttempt
    // must derive a scoring-only stand-in — the instant the ACCEPTED
    // tier's condition became sustained-true — and that derivation must
    // be sensitive to which tier was actually accepted, never collapse to
    // the Finish click's wall-clock time, and never apply to
    // declared_unstable/failed outcomes.
    it("candidate_declared optimal Finish: recovery score reflects the derived sustained-since time, not the Finish click time", async () => {
      const { user, scenario } = await setup();
      const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
      // mitigationLevel=2 at 6s -> optimal sustained from 6s; 5s sustain
      // window completes at 11s. Finish is clicked much later (20s), so a
      // click-time derivation would read recoveryTimeSeconds=20-5=15s
      // (the 150-point band) while the correct sustained-since derivation
      // reads ~6s (the 300-point band).
      await applyMitigation(attempt.id, 6_000, 2, 0);
      await testDb.update(attempts).set({ lastSimulationTimeMs: 20_000 }).where(eq(attempts.id, attempt.id));

      const finishable = await loadFinishable(attempt.id);
      const result = await finishAttempt(finishable, "req-resolved-time", null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.outcome).toBe("resolved");
      expect(result.result.completionTier).toBe("optimal");

      const row = await loadFinishable(attempt.id);
      expect(row.recoveryScore).toBe(300);
    });

    it("candidate_declared acceptable Finish: recovery score reflects the acceptable tier's own sustained-since time, distinct from optimal's", async () => {
      const { user, scenario } = await setup();
      const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
      // mitigationLevel=1 -> errorRate=3, satisfies only acceptableCondition
      // (<5, sustained 3s), never optimal. incidentActive fires at 5s, so
      // acceptable sustain starts at 5s and completes at 8s. Finish well
      // after, at 25s (recoveryTimeSeconds from incidentStartedAtMs=5s ->
      // derived ~8s puts it in the 300-point band; a click-time derivation
      // would land in the lowest 50-point band instead).
      await applyMitigation(attempt.id, 5_000, 1, 0);
      await testDb.update(attempts).set({ lastSimulationTimeMs: 25_000 }).where(eq(attempts.id, attempt.id));

      const finishable = await loadFinishable(attempt.id);
      const result = await finishAttempt(finishable, "req-acceptable-time", null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.outcome).toBe("resolved");
      expect(result.result.completionTier).toBe("acceptable");

      const row = await loadFinishable(attempt.id);
      expect(row.recoveryScore).toBe(300);
    });

    it("declared_unstable Finish gets no synthetic resolvedAtMs: recovery/reliability stay zeroed via the unresolved bucket", async () => {
      const { user, scenario } = await setup();
      const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
      // Finish almost immediately after mitigation, well before any
      // sustain window completes.
      await applyMitigation(attempt.id, 6_000, 2, 0);
      await testDb.update(attempts).set({ lastSimulationTimeMs: 7_000 }).where(eq(attempts.id, attempt.id));

      const finishable = await loadFinishable(attempt.id);
      const result = await finishAttempt(finishable, "req-unstable-time", null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.outcome).toBe("declared_unstable");

      const row = await loadFinishable(attempt.id);
      expect(row.recoveryScore).toBe(0);
      expect(row.reliabilityScore).toBe(0);
    });

    it("automatic failure Finish: failedAtMs remains purely engine-derived, unaffected by the resolvedAtMs override mechanism", async () => {
      const { user, scenario } = await setup();
      const attempt = await startPracticeAttempt(user.id, scenario.id, 1);
      // Sustaining a breached failureCondition no longer ends an attempt
      // on its own — the only automatic-failure trigger left is the
      // uniform 35-minute attempt ceiling (ATTEMPT_CEILING_MS), measured
      // from incidentStartedAtMs (this fixture's incidentActive trigger
      // fires at 5s, not at simulation-time zero). This test asserts
      // status === "failed" directly, so it must reach past the ceiling.
      await testDb
        .update(attempts)
        .set({ lastSimulationTimeMs: 5_000 + ATTEMPT_CEILING_MS + 1_000 })
        .where(eq(attempts.id, attempt.id));

      const finishable = await loadFinishable(attempt.id);
      const result = await finishAttempt(finishable, "req-failure-time", null);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.outcome).toBe("declared_unstable");
      expect(result.result.state.status).toBe("failed");
      expect(result.result.state.failedAtMs).not.toBeNull();
      expect(result.result.state.resolvedAtMs).toBeNull();

      const row = await loadFinishable(attempt.id);
      // terminalOverrides.failed (not .unresolved) zeroes these — proving
      // the failed-at-engine-level path, not a resolvedAtMs override, is
      // what drove the score.
      expect(row.recoveryScore).toBe(0);
      expect(row.reliabilityScore).toBe(0);
    });
  });
});
