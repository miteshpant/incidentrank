import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { distributedLockFailure } from "./distributed-lock-failure";
import {
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  distributedLockFailureSimulation,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./distributed-lock-failure/definition";
import { distributedLockFailureCandidateUI } from "./distributed-lock-failure/candidate-ui";
import { DISTRIBUTED_LOCK_FAILURE_SCORING } from "./distributed-lock-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(distributedLockFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += distributedLockFailureSimulation.tickMs
  ) {
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

    const result = simulate(
      distributedLockFailureSimulation,
      state,
      action,
      distributedLockFailureSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const PROCESSING_SLOWDOWN_MS = 30_000;
const WORKER_CRASH_MS = PROCESSING_SLOWDOWN_MS + 3 * 60_000;

describe("Distributed Lock Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(distributedLockFailure.isFree).toBe(false);
      expect(distributedLockFailure.library?.category).toBe("Distributed Systems");
      expect(distributedLockFailure.library?.tags.length).toBeGreaterThan(0);
      expect(distributedLockFailure.library?.skills.length).toBeGreaterThan(0);
      expect(distributedLockFailure.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DISTRIBUTED_LOCK_FAILURE_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        [
          "recovery",
          "customerImpact",
          "dataIntegrity",
          "reliability",
          "costEfficiency",
          "operationalEfficiency",
        ].sort(),
      );
      const totalMax = DISTRIBUTED_LOCK_FAILURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(distributedLockFailureCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(distributedLockFailureCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(distributedLockFailureCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(distributedLockFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.correctnessViolationCount).toBe(0);
      expect(state.values.lockSafetyMechanism).toBe("unresolved");
    });

    it("processing slowdown triggers the incident; default config (no mitigation) goes critical with real correctness violations", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(PROCESSING_SLOWDOWN_MS);
      expect(state.status).toBe("critical");
      expect(state.values.correctnessViolationCount).toBeGreaterThan(0);
      expect(state.values.overlappingOwnerCount).toBeGreaterThan(0);
      expect(state.values.lockServiceStatus).toBe("critical");
    });

    it("strong path: fencing enabled stays safe (zero correctness violations) even with the default short/medium lease and no renewal", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true },
      ]);
      expect(state.values.correctnessViolationCount).toBe(0);
      expect(state.values.lockServiceStatus).toBe("normal");
      expect(state.values.lockSafetyMechanism).toBe("fenced");
      // Overlap can still occur under fencing -- it is rendered harmless,
      // not prevented outright.
      expect(state.values.overlappingOwnerCount).toBeGreaterThan(0);
    });

    it("alternate good path: lease renewal enabled also reaches zero correctness violations while every worker stays alive", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_RENEWAL_ENABLED_KEY, value: true },
      ]);
      expect(state.values.correctnessViolationCount).toBe(0);
      expect(state.values.overlappingOwnerCount).toBe(0);
      expect(state.values.lockServiceStatus).toBe("normal");
      expect(state.values.lockSafetyMechanism).toBe("renewed");
    });

    it("harmful path: raising worker concurrency while unmitigated amplifies overlapping ownership and correctness violations", () => {
      const lowConcurrency = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 2 },
      ]);
      const scaled = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(scaled.values.correctnessViolationCount).toBeGreaterThan(
        lowConcurrency.values.correctnessViolationCount as number,
      );
      expect(scaled.values.overlappingOwnerCount).toBeGreaterThan(
        lowConcurrency.values.overlappingOwnerCount as number,
      );
    });

    it("harmful path: disabling retry backoff under contention raises lock contention rate on top of the lease problem", () => {
      const withBackoff = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: ACQUIRE_RETRY_BACKOFF_ENABLED_KEY, value: true },
      ]);
      const tightRetry = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: ACQUIRE_RETRY_BACKOFF_ENABLED_KEY, value: false },
      ]);
      expect(tightRetry.values.lockContentionRate).toBeGreaterThan(
        withBackoff.values.lockContentionRate as number,
      );
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 30_000);
      expect(state.status).toBe("critical");
      expect(state.values.lockServiceStatus).toBe("critical");
    });

    it("delayed consequence: a worker crash occurs on a second wave, with observable lease-expiry/contention precursors already visible beforehand", () => {
      const beforeCrash = runScenario(PROCESSING_SLOWDOWN_MS + 10_000);
      // Observable precursors already visible before the crash lands.
      expect(beforeCrash.values.leaseExpiryDuringProcessingCount).toBeGreaterThan(0);
      expect(beforeCrash.values.lockContentionRate).toBeGreaterThan(0);

      const afterCrash = runScenario(WORKER_CRASH_MS + 5_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 2 },
      ]);
      expect(afterCrash.values.resourceBlockedSeconds).toBeGreaterThan(0);
    });

    it("stays active (never auto-fails) even after correctness violations stay at or above 15 past the old sustained window", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 61_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        distributedLockFailureSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak correctness violation count and peak overlapping owner count generically via numericWatchFields", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 1_000);
      expect(state.peaks.peakValues.correctnessViolationCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.overlappingOwnerCount).toBeGreaterThan(0);
    });

    it("tracks monthly infrastructure cost that increases with worker concurrency", () => {
      let state = createInitialState(distributedLockFailureSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(250);

      state = simulate(
        distributedLockFailureSimulation,
        state,
        { id: "scale-workers", timestampMs: 0, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
        distributedLockFailureSimulation.tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(250 + 120);
    });

    describe("Healthy-looking-but-corrupt state (the trap: long lease, no fencing, no renewal)", () => {
      it("is real: long lease reduces frequency of violations but does not eliminate them, and never satisfies successCondition", () => {
        const shortLease = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
          { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 5 },
        ]);
        const longLease = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
          { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 120 },
        ]);

        // Long lease genuinely reduces overlapping ownership relative to
        // the short-lease-no-mitigation baseline...
        expect(longLease.values.overlappingOwnerCount).toBeLessThan(
          shortLease.values.overlappingOwnerCount as number,
        );
        expect(longLease.values.correctnessViolationCount).toBeLessThan(
          shortLease.values.correctnessViolationCount as number,
        );

        // ...but it never reaches zero/safe: a real, observable,
        // nonzero correctness violation is still present.
        expect(longLease.values.correctnessViolationCount).toBeGreaterThan(0);
        expect(longLease.values.lockServiceStatus).not.toBe("normal");
        expect(longLease.values.lockSafetyMechanism).not.toBe("fenced");

        const eligibility = evaluateCompletionEligibility(distributedLockFailureSimulation, longLease);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("Finish from the long-lease-without-fencing trap -> declared_unstable, not resolved", () => {
        const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
          { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 120 },
        ]);
        const result = evaluateCandidateDeclaredFinish(distributedLockFailureSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });

      it("after a worker crash, the long-lease-without-fencing choice blocks the shared resource far longer than fencing with a short lease", () => {
        const longLeaseNoFencingCrash = runScenario(WORKER_CRASH_MS + 5_000, [
          { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 120 },
        ]);
        const fencedShortLeaseCrash = runScenario(WORKER_CRASH_MS + 5_000, [
          { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true },
          { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 5 },
        ]);

        expect(longLeaseNoFencingCrash.values.resourceBlockedSeconds).toBeGreaterThan(
          fencedShortLeaseCrash.values.resourceBlockedSeconds as number,
        );
        expect(longLeaseNoFencingCrash.values.correctnessViolationCount).toBe(0);
        expect(fencedShortLeaseCrash.values.correctnessViolationCount).toBe(0);
        // The long-lease path is still unsafe to hand back right now
        // (resource blocked, critical status) even though neither path
        // currently shows a correctness violation.
        expect(longLeaseNoFencingCrash.values.lockServiceStatus).toBe("critical");
        expect(fencedShortLeaseCrash.values.lockServiceStatus).toBe("normal");
      });
    });
  });

  describe("Completion mode: candidate_declared, single-tier (no acceptableCondition)", () => {
    it("fencing-enabled success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        distributedLockFailureSimulation.successCondition.sustainedSeconds,
      );
    });

    it("renewal-enabled success is also eligible (optimal tier, since there is no acceptableCondition)", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_RENEWAL_ENABLED_KEY, value: true },
      ]);
      const eligibility = evaluateCompletionEligibility(distributedLockFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from fenced -> resolved/optimal", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(distributedLockFailureSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(distributedLockFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("sustained breach alone still never auto-fails in candidate_declared mode; a Finish there still yields declared_unstable", () => {
      const state = runScenario(PROCESSING_SLOWDOWN_MS + 61_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(distributedLockFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, actions);
      const runB = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (fenced), alternate-good (renewed), baseline, harmful (concurrency-amplified), and the healthy-looking-but-corrupt (long lease, no fencing) paths with coherent Data Integrity discrimination", () => {
      const fencedState = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: FENCING_TOKEN_ENABLED_KEY, value: true },
      ]);
      const fencedFinish = evaluateCandidateDeclaredFinish(distributedLockFailureSimulation, fencedState);
      const fencedScore = scoreAuthoredAttempt(
        DISTRIBUTED_LOCK_FAILURE_SCORING,
        extractFinishScoringInputs(distributedLockFailureSimulation, fencedFinish),
      );

      const renewedState = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_RENEWAL_ENABLED_KEY, value: true },
      ]);
      const renewedFinish = evaluateCandidateDeclaredFinish(distributedLockFailureSimulation, renewedState);
      const renewedScore = scoreAuthoredAttempt(
        DISTRIBUTED_LOCK_FAILURE_SCORING,
        extractFinishScoringInputs(distributedLockFailureSimulation, renewedFinish),
      );

      // Never-resolved attempts are scored via the unresolved terminal
      // override -- no synthetic resolvedAtMs is ever fabricated for
      // baseline, harmful, or the long-lease trap, since none of them
      // are Finish-eligible.
      const baselineState = runScenario(PROCESSING_SLOWDOWN_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        DISTRIBUTED_LOCK_FAILURE_SCORING,
        extractScoringInputs(distributedLockFailureSimulation, baselineState),
      );

      const harmfulState = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: WORKER_CONCURRENCY_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        DISTRIBUTED_LOCK_FAILURE_SCORING,
        extractScoringInputs(distributedLockFailureSimulation, harmfulState),
      );

      const corruptButAvailableState = runScenario(PROCESSING_SLOWDOWN_MS + 20_000, [
        { atMs: PROCESSING_SLOWDOWN_MS + 1_000, controlKey: LEASE_DURATION_SECONDS_KEY, value: 120 },
      ]);
      const corruptButAvailableScore = scoreAuthoredAttempt(
        DISTRIBUTED_LOCK_FAILURE_SCORING,
        extractScoringInputs(distributedLockFailureSimulation, corruptButAvailableState),
      );

      // Executed totals, read from an actual run (never assumed).
      // fenced and renewed tie on every dimension except Data
      // Integrity, where fencing's durable, crash-safe fix is worth
      // more than renewal's safe-only-while-alive mechanism. Baseline
      // and the corrupt-but-available trap tie overall (both never
      // resolve, so recovery/reliability are both zeroed by the
      // unresolved terminal override, and both carry
      // lockSafetyMechanism="unresolved") -- the two states are
      // genuinely scored the same way here, which is exactly correct:
      // neither is safe to hand back, regardless of how healthy the
      // trap's other metrics look.
      expect(fencedScore.total).toBe(865);
      expect(renewedScore.total).toBe(735);
      expect(baselineScore.total).toBe(420);
      expect(corruptButAvailableScore.total).toBe(420);
      expect(harmfulScore.total).toBe(360);

      // The central assertion for this batch: Data Integrity must be
      // measurably lower for the healthy-looking-but-corrupt state
      // (long lease, no fencing -- never Finish-eligible, scored via
      // the unresolved terminal override on every OTHER dimension)
      // than for the genuinely optimal, fenced, Finish-eligible state.
      // dataIntegrity has no terminalOverrides, so it is computed the
      // same declarative way regardless of resolution status, and it
      // is the dimension that correctly discriminates "durably safe"
      // from "not currently violating."
      expect(fencedScore.breakdown.dataIntegrity).toBe(200);
      expect(corruptButAvailableScore.breakdown.dataIntegrity).toBe(70);
      expect(fencedScore.breakdown.dataIntegrity).toBeGreaterThan(
        corruptButAvailableScore.breakdown.dataIntegrity,
      );

      // Renewed is also genuinely safe right now (it is equally
      // Finish-eligible, reaching resolved/optimal just as fast as
      // fenced), but it carries a latent crash risk fencing does not --
      // Data Integrity penalizes it exactly like the corrupt-but-
      // available state, pulling its total below fenced's even though
      // every other dimension ties between the two.
      expect(renewedScore.breakdown.dataIntegrity).toBe(70);
      expect(fencedScore.total).toBeGreaterThan(renewedScore.total);

      expect(fencedScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
    });
  });
});
