import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { fraudControlDegradationDuringPaymentSurge } from "./fraud-control-degradation-during-payment-surge";
import {
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
  fraudControlDegradationSimulation,
} from "./fraud-control-degradation-during-payment-surge/definition";
import { fraudControlDegradationCandidateUI } from "./fraud-control-degradation-during-payment-surge/candidate-ui";
import { FRAUD_CONTROL_DEGRADATION_SCORING } from "./fraud-control-degradation-during-payment-surge/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_2_MS,
  DRAIN_WINDOW_FULLY_DRAINED_MS,
  RISK_PROVIDER_RECOVERED_MS,
  RISK_PROVIDER_RECOVERING_MS,
  SURGE_ONSET_MS,
  SUSTAINED_SURGE_MS,
} from "./fraud-control-degradation-during-payment-surge/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(fraudControlDegradationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += fraudControlDegradationSimulation.tickMs
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
      fraudControlDegradationSimulation,
      state,
      action,
      fraudControlDegradationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function buildScoringInputs(state: ReturnType<typeof runScenario>) {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: null,
    failedAtMs: state.failedAtMs,
    totalTimeInCriticalMs: state.customerImpact.totalTimeInCriticalMs,
    totalTimeInDegradedMs: state.customerImpact.totalTimeInDegradedMs,
    revenueLossUsd: state.customerImpact.revenueLossUsd,
    peakSeverityRank: state.peaks.peakSeverityRank,
    numberOfConfigurationChanges: state.numberOfConfigurationChanges,
    numberOfHarmfulChanges: state.numberOfHarmfulChanges,
    numberOfBeneficialChanges: state.numberOfBeneficialChanges,
    initialMonthlyInfrastructureCostUsd: fraudControlDegradationSimulation.infrastructureCost.baselineMonthlyUsd,
    finalMonthlyInfrastructureCostUsd: state.cost.currentMonthlyCostUsd,
    peakMonthlyInfrastructureCostUsd: state.peaks.peakMonthlyCostUsd,
    finalNumericValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>,
    peakNumericValues: state.peaks.peakValues,
    finalStringValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
  };
}

// Safe sequence: bounded-fallback + usable Rules Engine + risk-weighted
// queue triage, engaged right after onset.
const SAFE_BOUNDED_FALLBACK_ACTIONS: TimedAction[] = [
  { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "risk-tiered-bounded-fallback" },
  { atMs: SURGE_ONSET_MS + 2_000, controlKey: MANUAL_REVIEW_QUEUE_PRIORITY_KEY, value: "risk-weighted" },
];

// Safe full-recovery sequence: risk-weighted queue triage, engaged once
// the External Risk Provider has fully recovered.
const SAFE_DRAIN_ACTIONS: TimedAction[] = [
  { atMs: RISK_PROVIDER_RECOVERED_MS + 1_000, controlKey: MANUAL_REVIEW_QUEUE_PRIORITY_KEY, value: "risk-weighted" },
];

describe("Fraud Control Degradation During Payment Surge", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(fraudControlDegradationDuringPaymentSurge.isFree).toBe(false);
      expect(fraudControlDegradationDuringPaymentSurge.library?.category).toBe("Security & Identity");
      expect(fraudControlDegradationDuringPaymentSurge.library?.tags.length).toBeGreaterThan(0);
      expect(fraudControlDegradationDuringPaymentSurge.library?.skills.length).toBeGreaterThan(0);
      expect(fraudControlDegradationDuringPaymentSurge.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = FRAUD_CONTROL_DEGRADATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = FRAUD_CONTROL_DEGRADATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(fraudControlDegradationCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(fraudControlDegradationCandidateUI.controls.length).toBe(6);
      expect(fraudControlDegradationCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 flat nodes and 5 edges matching the spec", () => {
      expect(fraudControlDegradationSimulation.architecture.nodes.length).toBe(6);
      expect(fraudControlDegradationSimulation.architecture.edges.length).toBe(5);
    });

    it("the briefing explicitly states all four business invariants and the security invariant", () => {
      expect(fraudControlDegradationDuringPaymentSurge.description).toMatch(
        /never at the cost of disabling mandatory fraud controls entirely/i,
      );
      expect(fraudControlDegradationDuringPaymentSurge.description).toMatch(
        /must never bypass fraud review, regardless of throughput pressure/i,
      );
      expect(fraudControlDegradationDuringPaymentSurge.description).toMatch(
        /bounded, authored fallback risk-check mode/i,
      );
      expect(fraudControlDegradationDuringPaymentSurge.description).toMatch(
        /non-resetting risk exposure/i,
      );
      expect(fraudControlDegradationDuringPaymentSurge.description).toMatch(
        /may never be bypassed to relieve checkout latency or throughput pressure, however severe/i,
      );
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of fraudControlDegradationSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control is exercised by at least one action classification rule", () => {
      const controlKeys = fraudControlDegradationSimulation.controls.map((c) => c.key);
      const classifiedKeys = new Set(
        fraudControlDegradationSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const key of controlKeys) {
        expect(classifiedKeys.has(key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(fraudControlDegradationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.cumulativeFraudReviewBypassCount).toBe(0);
      expect(state.values.manualReviewQueueDepth).toBe(5);
    });

    it("surge onset triggers the incident while the Ledger stays fully healthy (decoy signal)", () => {
      const state = runScenario(SURGE_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(SURGE_ONSET_MS);
      expect(state.values.ledgerWriteSuccessRate).toBe(99.9);
      expect(state.values.riskProviderStatus).toBe("critical");
      expect(state.values.manualReviewQueueDepth).toBeGreaterThan(5);
    });

    it("IMMEDIATE-FINISH AUDIT: zero actions, Finish immediately -> declared_unstable", () => {
      const state = runScenario(SURGE_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("fail-closed-mandatory-all-baseline");
      const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(fraudControlDegradationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("baseline (no action) is fail-closed-safe but needlessly holds low-risk transactions", () => {
      const state = runScenario(SURGE_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("fail-closed-mandatory-all-baseline");
      expect(state.values.fraudControlStatus).toBe("fail-closed");
      expect(state.values.lowRiskTransactionSuccessRate).toBeLessThan(60);
      expect(state.values.cumulativeFraudReviewBypassCount).toBe(0);
    });

    it("leaving the incident unaddressed long enough escalates into a materially worse fail-closed state (sustained surge)", () => {
      const state = runScenario(SUSTAINED_SURGE_MS + 5_000);
      expect(state.transitions.incidentState).toBe("fail-closed-mandatory-all-sustained");
      const early = runScenario(SURGE_ONSET_MS + 5_000);
      expect(state.values.manualReviewQueueDepth as number).toBeGreaterThan(
        early.values.manualReviewQueueDepth as number,
      );
    });

    describe("Determinism", () => {
      it("identical inputs produce identical final state", () => {
        const a = runScenario(SURGE_ONSET_MS + 20_000, SAFE_BOUNDED_FALLBACK_ACTIONS);
        const b = runScenario(SURGE_ONSET_MS + 20_000, SAFE_BOUNDED_FALLBACK_ACTIONS);
        expect(a.values).toEqual(b.values);
        expect(a.transitions.incidentState).toEqual(b.transitions.incidentState);
      });
    });

    describe("Required queue-pressure-amplification trap (not a pressure-transfer/scaling mechanic)", () => {
      it("relaxed velocity threshold + fifo triage makes queue depth AND checkout latency measurably WORSE than baseline", () => {
        const baseline = runScenario(SURGE_ONSET_MS + 10_000);
        const amplified = runScenario(SURGE_ONSET_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: TRANSACTION_VELOCITY_THRESHOLD_KEY, value: "relaxed" },
        ]);
        expect(amplified.transitions.incidentState).toBe("velocity-relaxed-fifo-amplified");
        expect(amplified.values.manualReviewQueueDepth as number).toBeGreaterThan(
          baseline.values.manualReviewQueueDepth as number,
        );
        expect(amplified.values.checkoutP99LatencyMs as number).toBeGreaterThan(
          baseline.values.checkoutP99LatencyMs as number,
        );
        // Also a real, if smaller, erosion of mandatory-review coverage.
        expect(amplified.values.cumulativeFraudReviewBypassCount as number).toBeGreaterThan(0);
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, amplified);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Required security trap: broad fraud-review bypass", () => {
      it("availability improves while fraudControlStatus is compromised and a historical count accumulates", () => {
        const baseline = runScenario(SURGE_ONSET_MS + 10_000);
        const bypassed = runScenario(SURGE_ONSET_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(bypassed.transitions.incidentState).toBe("bypass-all-compromised");
        // Availability genuinely improves.
        expect(bypassed.values.checkoutSuccessRate as number).toBeGreaterThan(
          baseline.values.checkoutSuccessRate as number,
        );
        expect(bypassed.values.lowRiskTransactionSuccessRate as number).toBeGreaterThan(
          baseline.values.lowRiskTransactionSuccessRate as number,
        );
        expect(bypassed.values.highRiskTransactionSuccessRate as number).toBeGreaterThan(
          baseline.values.highRiskTransactionSuccessRate as number,
        );
        // Security invariant is violated.
        expect(bypassed.values.fraudControlStatus).toBe("compromised");
        // Historical security consequence accumulates.
        expect(bypassed.values.cumulativeFraudReviewBypassCount as number).toBeGreaterThan(0);
        // Can never resolve as safe via this path.
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, bypassed);
        expect(eligibility).toEqual({ eligible: false });
        // Finish returns unstable regardless of how healthy other metrics look.
        const finish = evaluateCandidateDeclaredFinish(fraudControlDegradationSimulation, bypassed);
        expect(finish.outcome).toBe("declared_unstable");
      });

      it("the historical count compounds the longer bypass is left active (sustained window)", () => {
        const earlyBypass = runScenario(SURGE_ONSET_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        const sustainedBypass = runScenario(SUSTAINED_SURGE_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(sustainedBypass.values.cumulativeFraudReviewBypassCount as number).toBeGreaterThan(
          earlyBypass.values.cumulativeFraudReviewBypassCount as number,
        );
      });

      it("HISTORICAL DAMAGE NON-RESET PROOF: reverting the bypass lever does not erase the peak exposure already recorded", () => {
        const bypassedThenReverted = runScenario(SURGE_ONSET_MS + 60_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
          { atMs: SURGE_ONSET_MS + 30_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "mandatory-all" },
        ]);
        // The live `values` snapshot legitimately returns to 0 once the
        // unsafe lever is off (the current rule match no longer carries
        // exposure) — this mirrors Identity Platform Degradation's and
        // Authorization Policy Rollout Failure's identical, documented
        // limitation.
        expect(bypassedThenReverted.values.cumulativeFraudReviewBypassCount).toBe(0);
        expect(bypassedThenReverted.values.fraudControlStatus).not.toBe("compromised");
        // But the engine's own peak-tracking (Math.max every tick,
        // regardless of which rule currently matches) never resets —
        // this is the real, non-resetting historical record scoring
        // reads.
        expect(bypassedThenReverted.peaks.peakValues.cumulativeFraudReviewBypassCount).toBeGreaterThan(0);
      });

      it("even availability improving further while the provider itself is recovering does not make bypass safe", () => {
        const bypassedDuringRecovery = runScenario(RISK_PROVIDER_RECOVERING_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(bypassedDuringRecovery.transitions.incidentState).toBe("bypass-all-compromised-during-recovery");
        expect(bypassedDuringRecovery.values.fraudControlStatus).toBe("compromised");
        const eligibility = evaluateCompletionEligibility(
          fraudControlDegradationSimulation,
          bypassedDuringRecovery,
        );
        expect(eligibility).toEqual({ eligible: false });
      });

      it("holding broad bypass through the sustained-surge window stays active (never auto-fails) despite sustaining past the old failure window", () => {
        const state = runScenario(SUSTAINED_SURGE_MS + 50_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(state.status).not.toBe("failed");
        expect(state.failedAtMs).toBeNull();
        expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
          fraudControlDegradationSimulation.failureCondition!.sustainedSeconds,
        );
      });

      it("provider-timeout-specific bypass (approve-on-timeout) is an equally unsafe, separately-tracked violation", () => {
        const state = runScenario(SURGE_ONSET_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: EXTERNAL_RISK_PROVIDER_FALLBACK_KEY, value: "approve-on-timeout" },
        ]);
        expect(state.transitions.incidentState).toBe("approve-on-timeout-compromised");
        expect(state.values.fraudControlStatus).toBe("compromised");
        expect(state.values.cumulativeFraudReviewBypassCount as number).toBeGreaterThan(0);
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Legitimate degraded-but-safe state: risk-tiered bounded fallback", () => {
      it("requires a usable Rules Engine — disabling it falls back to fail-closed outcomes at a real authored cost", () => {
        const state = runScenario(SURGE_ONSET_MS + 10_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "risk-tiered-bounded-fallback" },
          { atMs: SURGE_ONSET_MS + 2_000, controlKey: RULES_ENGINE_MODE_KEY, value: "disabled" },
        ]);
        expect(state.transitions.incidentState).toBe("bounded-fallback-requested-rules-engine-disabled");
        expect(state.values.fraudControlStatus).toBe("fail-closed");
        expect(state.values.lowRiskTransactionSuccessRate).toBe(42);
      });

      it("real bounded-fallback with fifo triage: low-risk succeeds, high-risk stays protected, zero violations", () => {
        const state = runScenario(SURGE_ONSET_MS + 30_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "risk-tiered-bounded-fallback" },
        ]);
        expect(state.transitions.incidentState).toBe("bounded-fallback-fifo");
        expect(state.values.fraudControlStatus).toBe("bounded-fallback");
        expect(state.values.lowRiskTransactionSuccessRate).toBeGreaterThan(90);
        expect(state.values.cumulativeFraudReviewBypassCount).toBe(0);
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });

      it("bounded-fallback with risk-weighted triage is an equally acceptable, and measurably lower-queue-depth, alternative", () => {
        const fifoState = runScenario(SURGE_ONSET_MS + 30_000, [
          { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "risk-tiered-bounded-fallback" },
        ]);
        const weightedState = runScenario(SURGE_ONSET_MS + 30_000, SAFE_BOUNDED_FALLBACK_ACTIONS);
        expect(weightedState.transitions.incidentState).toBe("bounded-fallback-risk-weighted");
        expect(weightedState.values.manualReviewQueueDepth as number).toBeLessThan(
          fifoState.values.manualReviewQueueDepth as number,
        );
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, weightedState);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });
    });

    describe("Recovery lag: manual-review-queue depth drains only over real elapsed drain time", () => {
      it("External Risk Provider full recovery alone does not address review-queue depth (separate axis)", () => {
        const state = runScenario(RISK_PROVIDER_RECOVERED_MS + 5_000);
        expect(state.transitions.incidentState).toBe("risk-provider-recovered-queue-unaddressed");
        expect(state.values.riskProviderStatus).toBe("normal");
        expect(state.values.manualReviewQueueDepth).toBeGreaterThan(40);
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("relief engaged but no elapsed window yet does not instantly clear the backlog (tick-zero proof)", () => {
        const state = runScenario(RISK_PROVIDER_RECOVERED_MS + 10_000, SAFE_DRAIN_ACTIONS);
        expect(state.transitions.incidentState).toBe("relief-just-engaged");
        expect(state.values.manualReviewQueueDepth).toBe(40);
      });

      it("after the first drain window, queue depth has genuinely dropped but is not yet at baseline", () => {
        const window1 = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_DRAIN_ACTIONS);
        expect(window1.transitions.incidentState).toBe("draining-window1-safe");
        expect(window1.values.manualReviewQueueDepth).toBeLessThan(40);
        expect(window1.values.manualReviewQueueDepth as number).toBeGreaterThan(15);
      });

      it("after the second drain window, queue depth has dropped further still", () => {
        const window1 = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_DRAIN_ACTIONS);
        const window2 = runScenario(DRAIN_WINDOW_2_MS + 5_000, SAFE_DRAIN_ACTIONS);
        expect(window2.transitions.incidentState).toBe("draining-window2-safe");
        expect(window2.values.manualReviewQueueDepth as number).toBeLessThan(
          window1.values.manualReviewQueueDepth as number,
        );
      });

      it("only after the fully-drained window does queue depth reach genuine baseline", () => {
        const drained = runScenario(DRAIN_WINDOW_FULLY_DRAINED_MS + 35_000, SAFE_DRAIN_ACTIONS);
        expect(drained.transitions.incidentState).toBe("fully-drained-safe");
        expect(drained.values.manualReviewQueueDepth).toBeLessThanOrEqual(15);
      });

      it("alternate strong path: the circuit breaker also reaches fully-drained safety", () => {
        const drainedViaBreaker = runScenario(DRAIN_WINDOW_FULLY_DRAINED_MS + 35_000, [
          { atMs: RISK_PROVIDER_RECOVERED_MS + 1_000, controlKey: RISK_PROVIDER_CIRCUIT_BREAKER_KEY, value: "half-open-probe" },
        ]);
        expect(drainedViaBreaker.transitions.incidentState).toBe("fully-drained-via-circuit-breaker");
        const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, drainedViaBreaker);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      });
    });

    it("reaching the fully-drained state via risk-weighted triage satisfies successCondition at the optimal tier", () => {
      const drained = runScenario(DRAIN_WINDOW_FULLY_DRAINED_MS + 35_000, SAFE_DRAIN_ACTIONS);
      const eligibility = evaluateCompletionEligibility(fraudControlDegradationSimulation, drained);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-drained) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_DRAINED_MS + 35_000, SAFE_DRAIN_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(fraudControlDegradationSimulation, state);
      const inputs = extractFinishScoringInputs(fraudControlDegradationSimulation, result);
      const score = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThan(700);
    });

    it("the acceptable bounded-fallback path scores safely, below optimal but well above the harmful path", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_DRAINED_MS + 35_000, SAFE_DRAIN_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(fraudControlDegradationSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(fraudControlDegradationSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, optimalInputs);

      const acceptableState = runScenario(SURGE_ONSET_MS + 30_000, SAFE_BOUNDED_FALLBACK_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(fraudControlDegradationSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(fraudControlDegradationSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, acceptableInputs);

      const harmfulState = runScenario(SUSTAINED_SURGE_MS + 60_000, [
        { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
      ]);
      const harmfulInputs = buildScoringInputs(harmfulState);
      const harmfulScore = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, harmfulInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      // Acceptable scores higher than optimal on recovery/customerImpact
      // (it genuinely resolves far faster and with far less revenue
      // loss, which is real and correctly rewarded) but dataIntegrity +
      // reliability's combined gap is deliberately sized large enough
      // to still keep optimal's TOTAL ahead — see the score-sanity
      // audit in definition.ts.
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.total).toBeGreaterThan(harmfulScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThan(0);
      expect(acceptableScore.breakdown.reliability).toBeLessThan(optimalScore.breakdown.reliability);
    });

    it("baseline (no action, fail-closed) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_SURGE_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBeLessThanOrEqual(30);
    });

    it("harmful path (broad fraud-review bypass) scores WORSE on dataIntegrity+reliability than the baseline despite better availability", () => {
      const baselineState = runScenario(SUSTAINED_SURGE_MS + 60_000);
      const baselineInputs = buildScoringInputs(baselineState);
      const baselineScore = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, baselineInputs);

      const bypassState = runScenario(SUSTAINED_SURGE_MS + 60_000, [
        { atMs: SURGE_ONSET_MS + 1_000, controlKey: FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY, value: "bypass-all" },
      ]);
      const bypassInputs = buildScoringInputs(bypassState);
      const bypassScore = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, bypassInputs);

      // Availability-good / security-bad: bypass has materially better
      // raw checkout/transaction success rates...
      expect(bypassState.values.checkoutSuccessRate as number).toBeGreaterThan(
        baselineState.values.checkoutSuccessRate as number,
      );
      // ...but scores strictly worse on the dimensions that matter —
      // the security-violating path must never score as safe, however
      // good availability looks.
      expect(bypassScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(bypassScore.breakdown.reliability).toBeLessThanOrEqual(baselineScore.breakdown.reliability);
      expect(bypassScore.breakdown.dataIntegrity).toBeLessThan(30);
      expect(bypassScore.total).toBeLessThan(baselineScore.total);
    });

    it("the queue-amplification trap scores worse than the plain fail-closed baseline despite not being a security violation", () => {
      const baselineState = runScenario(SURGE_ONSET_MS + 10_000);
      const amplifiedState = runScenario(SURGE_ONSET_MS + 10_000, [
        { atMs: SURGE_ONSET_MS + 1_000, controlKey: TRANSACTION_VELOCITY_THRESHOLD_KEY, value: "relaxed" },
      ]);

      const baselineScore = scoreAuthoredAttempt(FRAUD_CONTROL_DEGRADATION_SCORING, buildScoringInputs(baselineState));
      const amplifiedScore = scoreAuthoredAttempt(
        FRAUD_CONTROL_DEGRADATION_SCORING,
        buildScoringInputs(amplifiedState),
      );

      expect(amplifiedScore.total).toBeLessThan(baselineScore.total);
    });
  });
});
