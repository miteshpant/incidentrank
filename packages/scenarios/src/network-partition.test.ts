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
import { networkPartition } from "./network-partition";
import {
  LEDGER_AUTHORITATIVE_REGION_KEY,
  LEDGER_READ_MODE_KEY,
  LEDGER_WRITE_ROUTING_KEY,
  PROFILE_CONSISTENCY_MODE_KEY,
  REGION_A_ISOLATION_KEY,
  REGION_B_ISOLATION_KEY,
  networkPartitionSimulation,
} from "./network-partition/definition";
import { networkPartitionCandidateUI } from "./network-partition/candidate-ui";
import { NETWORK_PARTITION_SCORING } from "./network-partition/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(networkPartitionSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += networkPartitionSimulation.tickMs
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
      networkPartitionSimulation,
      state,
      action,
      networkPartitionSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const NETWORK_PARTITION_MS = 30_000;
const NETWORK_HEALED_MS = NETWORK_PARTITION_MS + 4 * 60_000;

describe("Network Partition", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(networkPartition.isFree).toBe(false);
      expect(networkPartition.library?.category).toBe("Distributed Systems");
      expect(networkPartition.library?.tags.length).toBeGreaterThan(0);
      expect(networkPartition.library?.skills.length).toBeGreaterThan(0);
      expect(networkPartition.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = NETWORK_PARTITION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = NETWORK_PARTITION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(networkPartitionCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(networkPartitionCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(networkPartitionCandidateUI.components.length).toBeGreaterThan(0);
    });

    it("the briefing explicitly states the two different consistency requirements", () => {
      expect(networkPartition.description).toMatch(/ledger/i);
      expect(networkPartition.description).toMatch(/profile/i);
      expect(networkPartition.description).toMatch(/never be accepted by more than one region/i);
      expect(networkPartition.description).toMatch(/tolerate temporary staleness/i);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(networkPartitionSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.ledgerWriteAuthority).toBe("single");
      expect(state.values.ledgerSafetyMechanism).toBe("unresolved");
    });

    it("network partition triggers the incident; default config (no mitigation) goes critical with dual ledger-write authority", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(NETWORK_PARTITION_MS);
      expect(state.status).toBe("critical");
      expect(state.values.ledgerWriteAuthority).toBe("dual");
      expect(state.values.ledgerConsistencyViolationCount).toBeGreaterThan(0);
    });

    it("strong path: single-region-authoritative ledger routing restores a single ledger writer without any manual isolation", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ]);
      expect(state.values.ledgerWriteAuthority).toBe("single");
      expect(state.values.ledgerConsistencyViolationCount).toBe(0);
      expect(state.values.ledgerSafetyMechanism).toBe("single-region-routed");
      expect(state.values.regionAAvailability).toBe(100);
      expect(state.values.regionBAvailability).toBe(100);
    });

    it("alternate good path: single-region-authoritative routing to Region B is equally structural and safe", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_AUTHORITATIVE_REGION_KEY, value: "region-b" },
      ]);
      expect(state.values.ledgerWriteAuthority).toBe("single");
      expect(state.values.ledgerConsistencyViolationCount).toBe(0);
      expect(state.values.ledgerSafetyMechanism).toBe("single-region-routed");
      expect(state.values.regionAAvailability).toBe(100);
      expect(state.values.regionBAvailability).toBe(100);
    });

    it("alternate good path: manually isolating Region B also reaches a safe single ledger writer", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_B_ISOLATION_KEY, value: "read-only" },
      ]);
      expect(state.values.ledgerWriteAuthority).toBe("single");
      expect(state.values.ledgerConsistencyViolationCount).toBe(0);
      expect(state.values.ledgerSafetyMechanism).toBe("region-isolated");
      expect(state.values.regionAAvailability).toBe(100);
      expect(state.values.regionBAvailability).toBe(0);
    });

    it("harmful path: leaving ledger routing at local-region-authoritative while isolating neither region never stops the dual-write trap", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_READ_MODE_KEY, value: "block-stale-reads" },
      ]);
      expect(state.values.ledgerWriteAuthority).toBe("dual");
      expect(state.values.ledgerConsistencyViolationCount).toBeGreaterThan(0);
      expect(state.values.ledgerSafetyMechanism).toBe("unresolved");
    });

    it("overly conservative path: isolating both regions is safe but sacrifices all ledger write availability", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_A_ISOLATION_KEY, value: "isolated" },
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_B_ISOLATION_KEY, value: "isolated" },
      ]);
      expect(state.values.ledgerWriteAuthority).toBe("single");
      expect(state.values.ledgerConsistencyViolationCount).toBe(0);
      expect(state.values.ledgerSafetyMechanism).toBe("both-isolated");
      expect(state.values.regionAAvailability).toBe(0);
      expect(state.values.regionBAvailability).toBe(0);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000);
      expect(state.status).toBe("critical");
      expect(state.values.ledgerWriteAuthority).toBe("dual");
    });

    it("the profile-consistency business tradeoff is genuinely bounded and non-corrupt, distinct from the ledger correctness gate", () => {
      const eventualState = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ]);
      expect(eventualState.values.profileStaleReadAgeSeconds).toBeGreaterThan(0);
      expect(eventualState.values.profileUnreconciledWriteCount).toBeGreaterThan(0);
      // Profile staleness never affects the ledger safety gate.
      expect(eventualState.values.ledgerConsistencyViolationCount).toBe(0);

      const strongProfileState = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: PROFILE_CONSISTENCY_MODE_KEY, value: "strong-single-region" },
      ]);
      expect(strongProfileState.values.profileStaleReadAgeSeconds).toBe(0);
      expect(strongProfileState.values.profileUnreconciledWriteCount).toBe(0);
    });

    it("delayed consequence: replication healing occurs on a second wave, with observable dual-write/violation precursors already visible beforehand", () => {
      const beforeHeal = runScenario(NETWORK_PARTITION_MS + 10_000);
      // Observable precursors already visible before healing.
      expect(beforeHeal.values.ledgerWriteAuthority).toBe("dual");
      expect(beforeHeal.values.ledgerConsistencyViolationCount).toBeGreaterThan(0);

      const afterHeal = runScenario(NETWORK_HEALED_MS + 5_000);
      expect(afterHeal.values.replicationHealth).toBe("replicating");
      // A real violation count accrued during the unsafe window does not
      // vanish just because the network healed.
      expect(afterHeal.values.ledgerConsistencyViolationCount).toBeGreaterThan(0);
    });

    it("stays active (never auto-fails) even after dual ledger-write authority with real violations persists past the old sustained window", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 91_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        networkPartitionSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak ledger-violation count generically via numericWatchFields", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 1_000);
      expect(state.peaks.peakValues.ledgerConsistencyViolationCount).toBeGreaterThan(0);
    });

    describe("Correctness violation is real even when availability looks fully healthy (the trap)", () => {
      it("both regions ledger-writable: availability reads 100/100 in both regions while ledgerConsistencyViolationCount is actively, visibly unsafe", () => {
        const state = runScenario(NETWORK_PARTITION_MS + 40_000);

        // The dangerous combination: customer-facing availability looks
        // perfect in BOTH regions at once...
        expect(state.values.regionAAvailability).toBe(100);
        expect(state.values.regionBAvailability).toBe(100);

        // ...while the real, observable correctness fields say the
        // opposite: dual ledger-write authority and real violations.
        expect(state.values.ledgerWriteAuthority).toBe("dual");
        expect(state.values.ledgerConsistencyViolationCount).toBeGreaterThan(0);

        // This must never satisfy successCondition, no matter how
        // healthy availability looks.
        const eligibility = evaluateCompletionEligibility(networkPartitionSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("Finish from the dual-ledger-write trap -> declared_unstable, not resolved", () => {
        const state = runScenario(NETWORK_PARTITION_MS + 40_000);
        const result = evaluateCandidateDeclaredFinish(networkPartitionSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
        expect(result.completionTier).toBeNull();
      });
    });

    describe("Immediate-Finish audit", () => {
      it("a zero-action Finish issued the instant the partition fires does NOT resolve (the trap engages immediately under default routing)", () => {
        const state = runScenario(NETWORK_PARTITION_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(networkPartitionSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("a zero-action Finish issued before the partition even starts is moot: no incident has started yet", () => {
        const state = runScenario(NETWORK_PARTITION_MS - 5_000);
        expect(state.incidentStartedAtMs).toBeNull();
        const result = evaluateCandidateDeclaredFinish(networkPartitionSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("even the correct fix requires the full 30s sustained window before Finish is eligible -- it is not free at the instant the control is set", () => {
        const justFixed = runScenario(NETWORK_PARTITION_MS + 1_000 + 1_000, [
          { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
        ]);
        expect(justFixed.values.ledgerWriteAuthority).toBe("single");
        const eligibility = evaluateCompletionEligibility(networkPartitionSimulation, justFixed);
        expect(eligibility.eligible).toBe(false);
        expect(justFixed.transitions.consecutiveSuccessSeconds).toBeLessThan(
          networkPartitionSimulation.successCondition.sustainedSeconds,
        );
      });
    });
  });

  describe("Completion mode: candidate_declared, single-tier (no acceptableCondition)", () => {
    it("single-region-routed success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        networkPartitionSimulation.successCondition.sustainedSeconds,
      );
    });

    it("region-isolated success is also eligible (optimal tier, since there is no acceptableCondition)", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_B_ISOLATION_KEY, value: "read-only" },
      ]);
      const eligibility = evaluateCompletionEligibility(networkPartitionSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from single-region-routed -> resolved/optimal", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ]);
      const result = evaluateCandidateDeclaredFinish(networkPartitionSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 40_000);
      const result = evaluateCandidateDeclaredFinish(networkPartitionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("never auto-fails regardless of candidate_declared mode; Finish from the still-active baseline is still declared_unstable", () => {
      const state = runScenario(NETWORK_PARTITION_MS + 91_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(networkPartitionSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ];
      const runA = runScenario(NETWORK_PARTITION_MS + 40_000, actions);
      const runB = runScenario(NETWORK_PARTITION_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (single-region routed), alternate-good (region-isolated), baseline, harmful-adjacent (read-mode only), and the available-but-corrupt trap with coherent Data Integrity discrimination", () => {
      const routedState = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ]);
      const routedFinish = evaluateCandidateDeclaredFinish(networkPartitionSimulation, routedState);
      const routedScore = scoreAuthoredAttempt(
        NETWORK_PARTITION_SCORING,
        extractFinishScoringInputs(networkPartitionSimulation, routedFinish),
      );

      const isolatedState = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_B_ISOLATION_KEY, value: "read-only" },
      ]);
      const isolatedFinish = evaluateCandidateDeclaredFinish(networkPartitionSimulation, isolatedState);
      const isolatedScore = scoreAuthoredAttempt(
        NETWORK_PARTITION_SCORING,
        extractFinishScoringInputs(networkPartitionSimulation, isolatedFinish),
      );

      // Never-resolved attempts are scored via the unresolved terminal
      // override -- no synthetic resolvedAtMs is ever fabricated for
      // baseline or the available-but-corrupt trap, since neither is
      // Finish-eligible.
      const baselineState = runScenario(NETWORK_PARTITION_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        NETWORK_PARTITION_SCORING,
        extractScoringInputs(networkPartitionSimulation, baselineState),
      );

      const availableButCorruptState = baselineState; // both regions writable, availability 100/100
      const availableButCorruptScore = scoreAuthoredAttempt(
        NETWORK_PARTITION_SCORING,
        extractScoringInputs(networkPartitionSimulation, availableButCorruptState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(routedScore.total).toBe(865);
      expect(isolatedScore.total).toBe(725);
      expect(baselineScore.total).toBe(410);
      expect(availableButCorruptScore.total).toBe(410);

      // The central assertion for this batch: Data Integrity must be
      // measurably lower for the available-but-corrupt dual-ledger-write
      // state (never Finish-eligible, scored via the unresolved terminal
      // override on every OTHER dimension) than for the genuinely
      // optimal, single-region-routed, Finish-eligible state -- even
      // though the trap's customer-facing availability metrics read as
      // fully healthy in both regions.
      expect(routedScore.breakdown.dataIntegrity).toBe(200);
      expect(availableButCorruptScore.breakdown.dataIntegrity).toBe(60);
      expect(routedScore.breakdown.dataIntegrity).toBeGreaterThan(
        availableButCorruptScore.breakdown.dataIntegrity,
      );

      // Manually isolating the non-authoritative region is also genuinely
      // safe right now and equally Finish-eligible, but it scores lower
      // on Data Integrity than the structural single-region-routing fix,
      // since it is not backed by a structural guarantee against a
      // future partition.
      expect(isolatedScore.breakdown.dataIntegrity).toBe(60);
      expect(routedScore.total).toBeGreaterThan(isolatedScore.total);

      expect(routedScore.total).toBeGreaterThan(baselineScore.total);

      // Known generic-scorer characteristic (already accepted for
      // Split-Brain Incident/Distributed Lock Failure): a
      // candidate_declared Finish's scoringResolvedAtMs is derived from
      // the moment the success condition became sustained-true, which
      // can be short relative to critical time already accrued just
      // before the fix landed -- criticalTimeRatio can land in the
      // lowest reliability band even for a genuinely optimal, fast
      // resolution. Data Integrity (not Reliability) is the dimension
      // this scenario relies on to discriminate the trap from the fix.
      expect(routedScore.breakdown.reliability).toBe(15);
      expect(isolatedScore.breakdown.reliability).toBe(15);
    });

    it("the alternate-good manual-isolation path is penalized relative to the structural fix purely via Data Integrity, not Recovery/Reliability", () => {
      const routedState = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
      ]);
      const routedFinish = evaluateCandidateDeclaredFinish(networkPartitionSimulation, routedState);
      const routedScore = scoreAuthoredAttempt(
        NETWORK_PARTITION_SCORING,
        extractFinishScoringInputs(networkPartitionSimulation, routedFinish),
      );

      const isolatedState = runScenario(NETWORK_PARTITION_MS + 40_000, [
        { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: REGION_A_ISOLATION_KEY, value: "read-only" },
      ]);
      const isolatedFinish = evaluateCandidateDeclaredFinish(networkPartitionSimulation, isolatedState);
      const isolatedScore = scoreAuthoredAttempt(
        NETWORK_PARTITION_SCORING,
        extractFinishScoringInputs(networkPartitionSimulation, isolatedFinish),
      );

      expect(routedScore.breakdown.recovery).toBe(isolatedScore.breakdown.recovery);
      expect(routedScore.breakdown.reliability).toBe(isolatedScore.breakdown.reliability);
      expect(routedScore.breakdown.dataIntegrity).toBeGreaterThan(isolatedScore.breakdown.dataIntegrity);
    });
  });
});
