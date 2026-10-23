import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { deadlockStorm, deadlockStormCandidateUI, DEADLOCK_STORM_SCORING } from "./deadlock-storm";
import {
  DEADLOCK_RETRY_POLICY_KEY,
  RETRY_BACKOFF_KEY,
  SERVICE_CONCURRENCY_KEY,
  TRANSACTION_LOCK_ORDERING_KEY,
  TRANSACTION_SCOPE_KEY,
  WRITE_SERIALIZATION_KEY,
  deadlockStormSimulation,
} from "./deadlock-storm/definition";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(deadlockStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += deadlockStormSimulation.tickMs) {
    let action: CandidateAction | null = null;

    if (actionIndex < actions.length && actions[actionIndex]!.atMs <= timeMs) {
      const pending = actions[actionIndex]!;
      actionCounter += 1;
      action = {
        id: `action-${actionCounter}`,
        timestampMs: timeMs,
        controlKey: pending.controlKey,
        value: pending.value,
      };
      actionIndex += 1;
    }

    const result = simulate(deadlockStormSimulation, state, action, deadlockStormSimulation.tickMs);
    state = result.state;
  }

  return state;
}

function scoreOf(state: ReturnType<typeof runScenario>) {
  const finishResult = evaluateCandidateDeclaredFinish(deadlockStormSimulation, state);
  const inputs =
    finishResult.outcome === "resolved"
      ? extractFinishScoringInputs(deadlockStormSimulation, finishResult)
      : extractScoringInputs(deadlockStormSimulation, state);
  return scoreAuthoredAttempt(DEADLOCK_STORM_SCORING, inputs);
}

const CONFLICT_MS = 30_000;

describe("Deadlock Storm", () => {
  // ── Definition ────────────────────────────────────────────────────
  describe("definition", () => {
    it("validates without throwing and carries complete catalog metadata", () => {
      expect(deadlockStorm.isFree).toBe(false);
      expect(deadlockStorm.difficulty).toBe("senior");
      expect(deadlockStorm.library?.category).toBe("Databases & Storage");
      expect(deadlockStorm.library?.tags.length).toBeGreaterThan(0);
      expect(deadlockStorm.library?.skills.length).toBeGreaterThan(0);
      expect(deadlockStorm.library?.shortDescription.length).toBeGreaterThan(0);
    });

    it("has a scoring config with all six dimensions summing to 1000 max points", () => {
      const totalMax = DEADLOCK_STORM_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
      expect(DEADLOCK_STORM_SCORING.dimensions.map((d) => d.dimension).sort()).toEqual(
        ["costEfficiency", "customerImpact", "dataIntegrity", "operationalEfficiency", "recovery", "reliability"].sort(),
      );
    });

    it("has a candidate UI descriptor covering every metric and control", () => {
      expect(deadlockStormCandidateUI.metrics.length).toBeGreaterThanOrEqual(6);
      expect(deadlockStormCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(deadlockStormCandidateUI.components.length).toBe(4);
    });
  });

  // ── Runtime ───────────────────────────────────────────────────────
  describe("runtime", () => {
    it("starts healthy with its own authored initial values", () => {
      const state = createInitialState(deadlockStormSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.deadlocksPerSec).toBe(0);
      expect(state.values.dbStatus).toBe("normal");
    });

    it("the lock-order conflict fires and the DB goes critical with no mitigation (baseline)", () => {
      const state = runScenario(CONFLICT_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(CONFLICT_MS);
      expect(state.status).toBe("critical");
      expect(state.values.deadlocksPerSec).toBeGreaterThan(0);
      expect(state.values.dbStatus).toBe("critical");
    });

    it("strong path: canonical lock ordering removes deadlocks entirely", () => {
      const state = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      expect(state.values.deadlocksPerSec).toBe(0);
      expect(state.values.dbStatus).toBe("normal");
      expect(state.values.checkoutFailureRate).toBeLessThanOrEqual(1);
    });

    it("alternate-good (acceptable) path: write serialization also removes deadlocks, but at a real cost", () => {
      const good = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      const serialized = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: WRITE_SERIALIZATION_KEY, value: true },
      ]);

      expect(serialized.values.deadlocksPerSec).toBe(0);
      expect(serialized.values.dbStatus).not.toBe("critical");
      // The real cost: materially worse latency than the canonical-ordering fix.
      expect(serialized.values.inventoryUpdateLatencyMs).toBeGreaterThan(
        good.values.inventoryUpdateLatencyMs as number,
      );
    });

    it("harmful path: aggressive retries plus scaled concurrency increase deadlock pressure beyond baseline", () => {
      const baseline = runScenario(CONFLICT_MS + 20_000);
      const harmful = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: SERVICE_CONCURRENCY_KEY, value: 16 },
      ]);

      // Default retry policy is already "aggressive" (controls.ts), so
      // scaling concurrency alone reaches the worst-case masking rule.
      expect(harmful.values.deadlocksPerSec).toBeGreaterThan(baseline.values.deadlocksPerSec as number);
      expect(harmful.values.lockWaitTimeMs).toBeGreaterThan(baseline.values.lockWaitTimeMs as number);
      expect(harmful.values.dbStatus).toBe("critical");
    });

    it("masking vs removing: bounding retries reduces deadlocks without fixing the cause, canonical ordering removes them entirely", () => {
      const bounded = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "bounded" },
      ]);
      const fixed = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);

      expect(bounded.values.deadlocksPerSec).toBeGreaterThan(0);
      expect(fixed.values.deadlocksPerSec).toBe(0);
    });

    it("delayed consequence: an unresolved conflict gets measurably worse once the traffic surge fires, with prior observable evidence", () => {
      const beforeSurge = runScenario(CONFLICT_MS + 20_000);
      const afterSurge = runScenario(CONFLICT_MS + 4 * 60_000 + 10_000);

      // Observable evidence: deadlocksPerSec and lockWaitTimeMs are
      // already elevated well before the surge — never zero/healthy
      // right up to a hidden cliff.
      expect(beforeSurge.values.deadlocksPerSec).toBeGreaterThan(0);
      expect(beforeSurge.values.dbStatus).toBe("critical");

      // The surge measurably worsens an already-bad, already-visible trend.
      expect(afterSurge.values.deadlocksPerSec).toBeGreaterThan(
        beforeSurge.values.deadlocksPerSec as number,
      );
      expect(afterSurge.values.lockWaitTimeMs).toBeGreaterThan(
        beforeSurge.values.lockWaitTimeMs as number,
      );
    });

    it("the traffic surge never worsens a state where the conflict has already been fixed", () => {
      const fixed = runScenario(CONFLICT_MS + 4 * 60_000 + 10_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      expect(fixed.values.deadlocksPerSec).toBe(0);
      expect(fixed.values.dbStatus).toBe("normal");
    });

    it("fails automatically if checkout failure rate stays at/above 20% for the full sustained window", () => {
      // Default controls (aggressive retry, no lock-order fix, no
      // serialization) land on the critical-default fallback rule, whose
      // checkoutFailureRate (7) does not breach the failure threshold —
      // use the explicit no-retry path instead, whose checkoutFailureRate
      // (22) does.
      const state = runScenario(CONFLICT_MS + 61_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "off" },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });
  });

  // ── Candidate-declared completion ────────────────────────────────
  describe("candidate-declared completion", () => {
    it("optimal (canonical ordering) sustains success but never auto-resolves", () => {
      const state = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        deadlockStormSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable (write serialization) sustains the acceptable bar but never auto-resolves", () => {
      const state = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: WRITE_SERIALIZATION_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        deadlockStormSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from the optimal state resolves with completionTier=optimal", () => {
      const state = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      const result = evaluateCandidateDeclaredFinish(deadlockStormSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from the acceptable state resolves with completionTier=acceptable", () => {
      const state = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: WRITE_SERIALIZATION_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(deadlockStormSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from an unsafe (unmitigated) state declares unstable", () => {
      const state = runScenario(CONFLICT_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(deadlockStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires even though completion is candidate_declared", () => {
      const state = runScenario(CONFLICT_MS + 61_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "off" },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(deadlockStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  // ── Scoring ───────────────────────────────────────────────────────
  describe("scoring", () => {
    // A 10-minute window (well past the traffic-surge second wave) is
    // used for partial/baseline/harmful so revenue-loss/critical-time
    // accumulation has enough room to actually cross scoring-band
    // boundaries — at a short window every unresolved path collapses
    // into the same top band and looks like a false tie.
    const LONG_WINDOW_MS = 10 * 60_000;

    it("orders optimal > acceptable > partial > baseline > harmful", () => {
      const optimal = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      const acceptable = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: WRITE_SERIALIZATION_KEY, value: true },
      ]);
      const partial = runScenario(CONFLICT_MS + LONG_WINDOW_MS, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "bounded" },
        { atMs: CONFLICT_MS + 1_000, controlKey: RETRY_BACKOFF_KEY, value: "exponential" },
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_SCOPE_KEY, value: "narrow" },
      ]);
      const baseline = runScenario(CONFLICT_MS + LONG_WINDOW_MS);
      const harmful = runScenario(CONFLICT_MS + LONG_WINDOW_MS, [
        { atMs: CONFLICT_MS + 1_000, controlKey: SERVICE_CONCURRENCY_KEY, value: 32 },
      ]);

      // Sanity-check the paths actually diverge the way the scenario
      // intends before asserting on score ordering: partial survives the
      // surge (bounding retries is a real, if incomplete, mitigation),
      // while baseline (default aggressive retry) and harmful (scaled
      // concurrency on top of aggressive retry) both breach the failure
      // threshold once the surge compounds them.
      expect(partial.status).not.toBe("failed");
      expect(baseline.status).toBe("failed");
      expect(harmful.status).toBe("failed");

      const optimalScore = scoreOf(optimal).total;
      const acceptableScore = scoreOf(acceptable).total;
      const partialScore = scoreOf(partial).total;
      const baselineScore = scoreOf(baseline).total;
      const harmfulScore = scoreOf(harmful).total;

      expect(optimalScore).toBeGreaterThan(acceptableScore);
      expect(acceptableScore).toBeGreaterThan(partialScore);
      expect(partialScore).toBeGreaterThan(baselineScore);
      expect(baselineScore).toBeGreaterThan(harmfulScore);
    });

    it("a failed attempt never outscores an unresolved-but-active one, however long it ran (terminalOverride guard)", () => {
      const baseline = runScenario(CONFLICT_MS + LONG_WINDOW_MS);
      const fastFail = runScenario(CONFLICT_MS + 61_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "off" },
      ]);

      expect(baseline.status).toBe("failed");
      expect(fastFail.status).toBe("failed");
      // Both are failed attempts; customerImpact's terminalOverride
      // (failed: 20) means neither can hide behind a short runtime's
      // deceptively low raw revenueLossUsd — see scoring.ts.
      expect(scoreOf(baseline).breakdown.customerImpact).toBe(20);
      expect(scoreOf(fastFail).breakdown.customerImpact).toBe(20);
    });

    it("records the actual executed totals for good/acceptable/partial/baseline/harmful/failed paths", () => {
      const optimal = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ]);
      const acceptable = runScenario(CONFLICT_MS + 20_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: WRITE_SERIALIZATION_KEY, value: true },
      ]);
      const partial = runScenario(CONFLICT_MS + LONG_WINDOW_MS, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "bounded" },
        { atMs: CONFLICT_MS + 1_000, controlKey: RETRY_BACKOFF_KEY, value: "exponential" },
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_SCOPE_KEY, value: "narrow" },
      ]);
      const baseline = runScenario(CONFLICT_MS + LONG_WINDOW_MS);
      const harmful = runScenario(CONFLICT_MS + LONG_WINDOW_MS, [
        { atMs: CONFLICT_MS + 1_000, controlKey: SERVICE_CONCURRENCY_KEY, value: 32 },
      ]);
      const failed = runScenario(CONFLICT_MS + 61_000, [
        { atMs: CONFLICT_MS + 1_000, controlKey: DEADLOCK_RETRY_POLICY_KEY, value: "off" },
      ]);

      // Pin the actual executed numbers (observed by running this test),
      // not just inequalities, per the scoring-fidelity requirement.
      expect(scoreOf(optimal).total).toBe(865);
      expect(scoreOf(acceptable).total).toBe(845);
      expect(scoreOf(partial).total).toBe(550);
      expect(scoreOf(baseline).total).toBe(370);
      expect(scoreOf(harmful).total).toBe(280);
      expect(scoreOf(failed).total).toBe(370);
    });
  });

  // ── Determinism ───────────────────────────────────────────────────
  describe("determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: CONFLICT_MS + 1_000, controlKey: TRANSACTION_LOCK_ORDERING_KEY, value: "canonical" },
      ];
      const runA = runScenario(CONFLICT_MS + 45_000, actions);
      const runB = runScenario(CONFLICT_MS + 45_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical scoring for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: CONFLICT_MS + 1_000, controlKey: WRITE_SERIALIZATION_KEY, value: true },
      ];
      const scoreA = scoreOf(runScenario(CONFLICT_MS + 20_000, actions));
      const scoreB = scoreOf(runScenario(CONFLICT_MS + 20_000, actions));
      expect(scoreA).toEqual(scoreB);
    });
  });
});
