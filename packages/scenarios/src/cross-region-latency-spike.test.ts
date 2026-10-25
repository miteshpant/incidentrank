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
import { crossRegionLatencySpike } from "./cross-region-latency-spike";
import {
  CROSS_REGION_DEPENDENCY_KEY,
  crossRegionLatencySpikeSimulation,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  REGIONAL_FAILOVER_KEY,
  TRAFFIC_LOCALITY_KEY,
} from "./cross-region-latency-spike/definition";
import { crossRegionLatencySpikeCandidateUI } from "./cross-region-latency-spike/candidate-ui";
import { CROSS_REGION_LATENCY_SPIKE_SCORING } from "./cross-region-latency-spike/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(crossRegionLatencySpikeSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += crossRegionLatencySpikeSimulation.tickMs
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
      crossRegionLatencySpikeSimulation,
      state,
      action,
      crossRegionLatencySpikeSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const RTT_SPIKE_MS = 30_000;
const SUSTAINED_DEGRADATION_MS = RTT_SPIKE_MS + 3 * 60_000;

// A single action sequence that reaches the OPTIMAL fast-tradeoff path:
// general traffic relaxed to region-local/eventual, payment untouched.
const RELAX_GENERAL_TRAFFIC_ACTIONS: TimedAction[] = [
  { atMs: RTT_SPIKE_MS + 1_000, controlKey: CROSS_REGION_DEPENDENCY_KEY, value: "localOnly" },
  { atMs: RTT_SPIKE_MS + 2_000, controlKey: GENERAL_CONSISTENCY_MODE_KEY, value: "eventual" },
  { atMs: RTT_SPIKE_MS + 3_000, controlKey: READ_ROUTING_KEY, value: "localRegion" },
];

describe("Cross-Region Latency Spike", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(crossRegionLatencySpike.isFree).toBe(false);
      expect(crossRegionLatencySpike.library?.category).toBe("Distributed Systems");
      expect(crossRegionLatencySpike.library?.tags.length).toBeGreaterThan(0);
      expect(crossRegionLatencySpike.library?.skills.length).toBeGreaterThan(0);
      expect(crossRegionLatencySpike.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CROSS_REGION_LATENCY_SPIKE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CROSS_REGION_LATENCY_SPIKE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(crossRegionLatencySpikeCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(crossRegionLatencySpikeCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(crossRegionLatencySpikeCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(crossRegionLatencySpikeCandidateUI.components.length).toBe(3);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(crossRegionLatencySpikeSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.interRegionRttMs).toBe(40);
      expect(state.values.paymentAuthConsistency).toBe("strong");
    });

    it("the backbone RTT spike fires and raises regional customer latency while both regions are otherwise fine", () => {
      const state = runScenario(RTT_SPIKE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(RTT_SPIKE_MS);
      expect(state.status).toBe("degraded");
      expect(state.values.interRegionRttMs).toBe(480);
      expect(state.values.usCustomerLatencyMs).toBe(540);
      expect(state.values.euCustomerLatencyMs).toBe(560);
      expect(state.values.paymentAuthConsistency).toBe("strong");
    });

    it("good path A (patient, fully synchronous, no action): correctness stays maximal but latency stays elevated", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000);
      expect(state.values.paymentAuthConsistency).toBe("strong");
      expect(state.values.usCustomerLatencyMs).toBe(540);
      expect(state.values.backboneStatus).toBe("warning");
    });

    it("good path B (fast, general traffic relaxed): regional latency recovers close to normal, payment untouched", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      expect(state.values.usCustomerLatencyMs).toBe(110);
      expect(state.values.euCustomerLatencyMs).toBe(120);
      expect(state.values.replicationLagMs).toBe(850);
      expect(state.values.paymentAuthConsistency).toBe("strong");
    });

    it("the two good paths produce genuinely different latency/replication-lag profiles, not a tie", () => {
      const patient = runScenario(RTT_SPIKE_MS + 20_000);
      const fast = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      expect(fast.values.usCustomerLatencyMs).toBeLessThan(patient.values.usCustomerLatencyMs as number);
      expect(fast.values.replicationLagMs).toBeGreaterThan(patient.values.replicationLagMs as number);
    });

    it("harmful path: relaxing payment auth consistency looks healthy on latency but flips the correctness field unsafe", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY, value: "eventual" },
      ]);
      expect(state.values.usCustomerLatencyMs).toBe(90);
      expect(state.values.euCustomerLatencyMs).toBe(95);
      expect(state.values.paymentAuthConsistency).toBe("relaxed-unsafe");
    });

    it("harmful path: forcing traffic locality to alwaysGlobal makes latency worse than the patient baseline", () => {
      const baseline = runScenario(RTT_SPIKE_MS + 20_000);
      const harmful = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: TRAFFIC_LOCALITY_KEY, value: "alwaysGlobal" },
      ]);
      expect(harmful.values.usCustomerLatencyMs).toBeGreaterThan(baseline.values.usCustomerLatencyMs as number);
      expect(harmful.values.backboneStatus).toBe("critical");
    });

    it("harmful path: regional failover adds RTT rather than removing it", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: REGIONAL_FAILOVER_KEY, value: true },
      ]);
      expect(state.values.euCustomerLatencyMs).toBe(610);
      expect(state.values.backboneStatus).toBe("critical");
    });

    it("baseline (no action) stays degraded and never self-resolves", () => {
      const state = runScenario(RTT_SPIKE_MS + 60_000);
      expect(state.status).toBe("degraded");
      expect(state.values.paymentAuthConsistency).toBe("strong");
    });

    it("delayed consequence: sustained backbone degradation deepens the patient-no-action state, with an observable precursor beforehand", () => {
      const beforeSustained = runScenario(RTT_SPIKE_MS + 60_000);
      // Observable precursor already visible well before the second wave.
      expect(beforeSustained.values.syncWriteLatencyMs).toBeGreaterThanOrEqual(500);
      expect(beforeSustained.values.usCustomerLatencyMs).toBeGreaterThanOrEqual(500);

      const afterSustained = runScenario(SUSTAINED_DEGRADATION_MS + 5_000);
      expect(afterSustained.values.backboneStatus).toBe("critical");
      expect(afterSustained.values.usCustomerLatencyMs).toBe(720);
    });

    it("fails if US customer latency stays at or above 700ms for the full sustained window", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 91_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak inter-region RTT and peak regional latency generically via numericWatchFields", () => {
      const state = runScenario(RTT_SPIKE_MS + 1_000);
      expect(state.peaks.peakValues.interRegionRttMs).toBe(480);
      expect(state.peaks.peakValues.usCustomerLatencyMs).toBe(540);
    });
  });

  describe("Correctness gate: both regions writable / payment relaxed must never count as safe", () => {
    it("the unsafe relaxed-payment state is real: paymentAuthConsistency is 'relaxed-unsafe', not merely a hidden flag", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY, value: "eventual" },
      ]);
      expect(state.values.paymentAuthConsistency).toBe("relaxed-unsafe");
    });

    it("the unsafe state does NOT satisfy successCondition even though every latency metric looks healthy", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY, value: "eventual" },
      ]);
      expect(state.values.usCustomerLatencyMs).toBeLessThanOrEqual(150);
      expect(state.values.euCustomerLatencyMs).toBeLessThanOrEqual(150);
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the unsafe state does NOT satisfy acceptableCondition either", () => {
      const state = runScenario(RTT_SPIKE_MS + 30_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY, value: "eventual" },
      ]);
      expect(state.transitions.consecutiveAcceptableSeconds).toBe(0);
    });

    it("Finish from the unsafe relaxed-payment state routes to declared_unstable, never resolved", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY, value: "eventual" },
      ]);
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Two-tier completion — fast relaxation (optimal) vs. patient fully-synchronous (acceptable)", () => {
    it("the fast path, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the patient path becomes eligible for an ACCEPTABLE-tier Finish only after the real sustain window — a legitimate handback once observed, not a trap", () => {
      const state = runScenario(RTT_SPIKE_MS + 50_000);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("the always-global harmful path remains ineligible for any Finish tier", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: TRAFFIC_LOCALITY_KEY, value: "alwaysGlobal" },
      ]);
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("once the backbone issue is confirmed sustained, the previously-acceptable patient-no-action state stops being eligible", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 20_000);
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        crossRegionLatencySpikeSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(RTT_SPIKE_MS + 50_000);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        crossRegionLatencySpikeSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(RTT_SPIKE_MS + 50_000);
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (always-global harmful path) -> declared_unstable", () => {
      const state = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: TRAFFIC_LOCALITY_KEY, value: "alwaysGlobal" },
      ]);
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 91_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Phase 6B.1 fix: immediate Finish no longer yields an instant near-perfect score", () => {
    it("zero-action immediate Finish (seconds after the incident begins) -> declared_unstable, not acceptable", () => {
      const state = runScenario(RTT_SPIKE_MS + 5_000);
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("waiting alone (no control changes) is never counted as a harmful or configuration change", () => {
      const state = runScenario(RTT_SPIKE_MS + 50_000);
      expect(state.numberOfConfigurationChanges).toBe(0);
      expect(state.numberOfHarmfulChanges).toBe(0);
    });

    it("the patient strategy only becomes Finish-eligible once the acceptable condition has genuinely been observed for the full post-incident sustain window, not merely the instant it first became true", () => {
      // consecutiveAcceptableSeconds only starts counting once the
      // incident actually begins (incidentStartedAtMs is set at
      // RTT_SPIKE_MS, and the counter reads ~1 at that tick, not
      // RTT_SPIKE_MS/1000) — this confirms there is no pre-incident
      // credit a fast-acknowledging candidate could exploit.
      const atTrigger = runScenario(RTT_SPIKE_MS);
      expect(atTrigger.incidentStartedAtMs).toBe(RTT_SPIKE_MS);
      expect(atTrigger.transitions.consecutiveAcceptableSeconds).toBeLessThanOrEqual(1);

      const justUnderSustain = runScenario(RTT_SPIKE_MS + 43_000);
      expect(
        evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, justUnderSustain),
      ).toEqual({ eligible: false });

      const atSustain = runScenario(RTT_SPIKE_MS + 44_000);
      expect(
        evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, atSustain),
      ).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("second-wave unsafe state cannot Finish as acceptable even if the candidate waits past the (now longer) sustain window", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 20_000);
      const eligibility = evaluateCompletionEligibility(crossRegionLatencySpikeSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      const runB = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal (fast relaxation), acceptable (patient), baseline-unresolved-early, and harmful (payment relaxed) paths with coherent ordering", () => {
      const optimalState = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractFinishScoringInputs(crossRegionLatencySpikeSimulation, optimalFinish),
      );

      const acceptableState = runScenario(RTT_SPIKE_MS + 50_000);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        crossRegionLatencySpikeSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractFinishScoringInputs(crossRegionLatencySpikeSimulation, acceptableFinish),
      );

      // Harmful/unsafe paths never reach Finish eligibility — score them
      // as never-resolved attempts via the unresolved terminal override
      // (no synthetic resolvedAtMs is ever fabricated).
      const harmfulState = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY, value: "eventual" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractScoringInputs(crossRegionLatencySpikeSimulation, harmfulState),
      );

      const alwaysGlobalState = runScenario(RTT_SPIKE_MS + 20_000, [
        { atMs: RTT_SPIKE_MS + 1_000, controlKey: TRAFFIC_LOCALITY_KEY, value: "alwaysGlobal" },
      ]);
      const alwaysGlobalScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractScoringInputs(crossRegionLatencySpikeSimulation, alwaysGlobalState),
      );

      // Phase 6B.1 fix: recovery/reliability/dataIntegrity still tie
      // between optimal and acceptable (both genuinely safe, same
      // sustain-anchored scoring timestamp mechanism) — but
      // customerImpact now carries real, decisive separation: the
      // patient path's required 45s observation window (revenue-and-
      // cost.ts) accrues real tracked revenue loss the fast path's much
      // shorter 15s sustain window does not. costEfficiency still
      // correctly runs the other way (the fast path pays a real ongoing
      // infrastructure cost for async replication). Net: optimal now
      // legitimately outscores acceptable overall, while acceptable
      // still earns a strong score — not a scoring bug, the real,
      // already-modeled tradeoff finally crossing a band boundary.
      expect(optimalScore.total).toBe(980);
      expect(acceptableScore.total).toBe(970);
      expect(optimalScore.total).toBeGreaterThan(acceptableScore.total);
      expect(harmfulScore.total).toBe(355);
      expect(alwaysGlobalScore.total).toBe(505);

      // Both safe paths clearly outscore both unsafe/harmful paths.
      expect(optimalScore.total).toBeGreaterThan(alwaysGlobalScore.total);
      expect(acceptableScore.total).toBeGreaterThan(alwaysGlobalScore.total);
      // The unsafe relaxed-payment path scores WORSE than the merely
      // unresolved always-global harmful path specifically because
      // dataIntegrity gates on paymentAuthConsistency — never because
      // its latency numbers look worse (they don't; they look better).
      expect(harmfulScore.total).toBeLessThan(alwaysGlobalScore.total);
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(200);
      expect(harmfulScore.breakdown.dataIntegrity).toBe(20);
      // The real, honest discriminators between the two safe paths —
      // each dimension pulls in its own genuine direction.
      expect(optimalScore.breakdown.costEfficiency).toBeLessThan(
        acceptableScore.breakdown.costEfficiency,
      );
      expect(optimalScore.breakdown.customerImpact).toBeGreaterThan(
        acceptableScore.breakdown.customerImpact,
      );
    });

    it("immediate Finish (never eligible) scores clearly below both legitimate Finish outcomes", () => {
      const immediateState = runScenario(RTT_SPIKE_MS + 5_000);
      const immediateScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractScoringInputs(crossRegionLatencySpikeSimulation, immediateState),
      );

      const optimalState = runScenario(RTT_SPIKE_MS + 20_000, RELAX_GENERAL_TRAFFIC_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractFinishScoringInputs(crossRegionLatencySpikeSimulation, optimalFinish),
      );

      const acceptableState = runScenario(RTT_SPIKE_MS + 50_000);
      const acceptableFinish = evaluateCandidateDeclaredFinish(crossRegionLatencySpikeSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        CROSS_REGION_LATENCY_SPIKE_SCORING,
        extractFinishScoringInputs(crossRegionLatencySpikeSimulation, acceptableFinish),
      );

      expect(immediateScore.total).toBeLessThan(acceptableScore.total);
      expect(immediateScore.total).toBeLessThan(optimalScore.total);
      // unresolved terminal override: recovery and reliability both floor.
      expect(immediateScore.breakdown.recovery).toBe(0);
      expect(immediateScore.breakdown.reliability).toBe(0);
    });
  });
});
