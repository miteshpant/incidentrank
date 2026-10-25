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
import { multiRegionPaymentPlatformDegradation } from "./multi-region-payment-platform-degradation";
import {
  EU_TRAFFIC_PERCENTAGE_KEY,
  FRAUD_FALLBACK_MODE_KEY,
  HIGH_RISK_THROTTLE_KEY,
  LEDGER_WRITE_AUTHORITY_KEY,
  RISK_ENRICHMENT_MODE_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
  multiRegionPaymentPlatformDegradationSimulation,
} from "./multi-region-payment-platform-degradation/definition";
import { multiRegionPaymentPlatformDegradationCandidateUI } from "./multi-region-payment-platform-degradation/candidate-ui";
import { MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING } from "./multi-region-payment-platform-degradation/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(multiRegionPaymentPlatformDegradationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += multiRegionPaymentPlatformDegradationSimulation.tickMs
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
      multiRegionPaymentPlatformDegradationSimulation,
      state,
      action,
      multiRegionPaymentPlatformDegradationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const EU_DEPENDENCY_DEGRADED_MS = 30_000;
const REPLICATION_LAG_ONSET_MS = 45_000;
const CATCHUP_WINDOW_ELAPSED_MS = REPLICATION_LAG_ONSET_MS + 3 * 60_000;

// Control combination representing correct sequencing: protect
// correctness (us-authoritative ledger authority), THEN shift a
// bounded share of traffic (40, not 0), THEN protect US ledger/
// settlement capacity (critical-path-first settlement, high-risk
// throttle).
const PROTECTED_SHIFT_ACTIONS: TimedAction[] = [
  { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
  { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
  { atMs: REPLICATION_LAG_ONSET_MS + 3_000, controlKey: SETTLEMENT_WORKER_PRIORITY_KEY, value: "critical-path-first" },
  { atMs: REPLICATION_LAG_ONSET_MS + 4_000, controlKey: HIGH_RISK_THROTTLE_KEY, value: "on" },
];

describe("Multi-Region Payment Platform Degradation", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(multiRegionPaymentPlatformDegradation.isFree).toBe(false);
      expect(multiRegionPaymentPlatformDegradation.library?.category).toBe("Distributed Systems");
      expect(multiRegionPaymentPlatformDegradation.library?.tags.length).toBeGreaterThan(0);
      expect(multiRegionPaymentPlatformDegradation.library?.skills.length).toBeGreaterThan(0);
      expect(multiRegionPaymentPlatformDegradation.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(multiRegionPaymentPlatformDegradationCandidateUI.metrics.length).toBeGreaterThanOrEqual(10);
      expect(multiRegionPaymentPlatformDegradationCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(multiRegionPaymentPlatformDegradationCandidateUI.components.length).toBe(12);
    });

    it("the architecture has exactly 12 nodes matching the spec", () => {
      expect(multiRegionPaymentPlatformDegradationSimulation.architecture.nodes.length).toBe(12);
    });

    it("the briefing explicitly states all three business invariants", () => {
      expect(multiRegionPaymentPlatformDegradation.description).toMatch(/divergent ledger authority/i);
      expect(multiRegionPaymentPlatformDegradation.description).toMatch(/mandatory fraud controls may not be bypassed/i);
      expect(multiRegionPaymentPlatformDegradation.description).toMatch(/settlement delay may be tolerated/i);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(multiRegionPaymentPlatformDegradationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.divergentLedgerAuthorityCount).toBe(0);
      expect(state.values.fraudControlBypassCount).toBe(0);
    });

    it("EU dependency degradation triggers the incident and hurts EU payment success while leaving US healthy", () => {
      const state = runScenario(EU_DEPENDENCY_DEGRADED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(EU_DEPENDENCY_DEGRADED_MS);
      expect(state.values.euRiskCheckSuccessRate).toBeLessThan(80);
      expect(state.values.usRiskCheckSuccessRate).toBeGreaterThanOrEqual(95);
    });

    it("replication lag onset independently begins after EU dependency degradation, with no action taken", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 1_000);
      expect(state.values.ledgerReplicationLagSeconds).toBeGreaterThan(0);
      expect(state.values.divergentLedgerAuthorityCount).toBe(0);
    });

    it("baseline (no action) stays unprotected: lag and backlog nonzero, no correctness violation yet", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000);
      expect(state.transitions.incidentState).toBe("baseline-unmitigated");
      expect(state.values.ledgerReplicationLagSeconds).toBeGreaterThan(0);
      expect(state.values.settlementBacklogThousands).toBeGreaterThan(0);
      expect(state.values.divergentLedgerAuthorityCount).toBe(0);
    });

    describe("Required pressure-transfer mechanism: shifting 100% EU traffic to US overloads US ledger/settlement", () => {
      it("harmful/tempting path: full dump to US improves EU/global availability but overloads US ledger utilization and settlement backlog", () => {
        const before = runScenario(REPLICATION_LAG_ONSET_MS + 20_000);

        const dumpedState = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
          { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 0 },
        ]);

        // EU/global availability metric improves...
        expect(dumpedState.values.euPaymentSuccessRate).toBeGreaterThanOrEqual(
          before.values.euPaymentSuccessRate as number,
        );
        expect(dumpedState.values.crossRegionTrafficPercentage).toBe(100);

        // ...while US ledger/settlement is measurably, concretely
        // overloaded as a direct, authored consequence -- real,
        // distinct numbers, not merely "higher."
        expect(dumpedState.values.usLedgerUtilization).toBeGreaterThan(100);
        expect(dumpedState.values.settlementBacklogThousands).toBeGreaterThan(
          before.values.settlementBacklogThousands as number,
        );
        expect(dumpedState.transitions.incidentState).toBe("us-ledger-overloaded");

        // No correctness violation here (ledger authority was fixed
        // first) -- this is a pure capacity pressure-transfer, not a
        // correctness trap.
        expect(dumpedState.values.divergentLedgerAuthorityCount).toBe(0);

        // Genuinely unsafe to hand back: fails acceptableCondition too.
        const eligibility = evaluateCompletionEligibility(multiRegionPaymentPlatformDegradationSimulation, dumpedState);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Unsafe sequencing: shifting traffic BEFORE protecting ledger authority creates real divergence", () => {
      it("unsafe sequence: partial shift with ledger authority still region-local produces a real, counted divergent-authority violation", () => {
        const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
        ]);
        expect(state.values.divergentLedgerAuthorityCount).toBeGreaterThan(0);
        expect(state.values.ledgerAuthorityMechanism).toBe("region-local-unsafe");
      });

      it("safe sequence: setting ledger authority to us-authoritative BEFORE shifting traffic avoids any divergence at all", () => {
        const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
          { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
        ]);
        expect(state.values.divergentLedgerAuthorityCount).toBe(0);
        expect(state.values.ledgerAuthorityMechanism).toBe("us-authoritative-routed");
      });

      it("the reversed order (shift first, fix authority second) leaves a real violation count that the later fix does not erase", () => {
        const reversed = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
          { atMs: REPLICATION_LAG_ONSET_MS + 10_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
        ]);
        // Once us-authoritative is set, the CURRENT rule match is safe
        // again (ledgerAuthorityMechanism flips back), but the
        // divergentLedgerAuthorityCount accrued during the unsafe
        // window was a real, authored, non-zero snapshot while the
        // unsafe rule was matched -- captured by the peak tracker.
        expect(reversed.peaks.peakValues.divergentLedgerAuthorityCount).toBeGreaterThan(0);
      });
    });

    describe("Mandatory fraud controls may never be bypassed", () => {
      it("fraud bypass path: payment throughput looks fine but fraudControlBypassCount is real and nonzero", () => {
        const state = runScenario(EU_DEPENDENCY_DEGRADED_MS + 5_000, [
          { atMs: EU_DEPENDENCY_DEGRADED_MS + 1_000, controlKey: FRAUD_FALLBACK_MODE_KEY, value: "bypass" },
        ]);
        expect(state.values.fraudControlBypassCount).toBeGreaterThan(0);
        expect(state.values.riskControlPosture).toBe("fraud-controls-bypassed");
        const eligibility = evaluateCompletionEligibility(multiRegionPaymentPlatformDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("cached-rules fallback preserves a real mandatory check -- zero bypass count", () => {
        const state = runScenario(EU_DEPENDENCY_DEGRADED_MS + 5_000, [
          { atMs: EU_DEPENDENCY_DEGRADED_MS + 1_000, controlKey: FRAUD_FALLBACK_MODE_KEY, value: "cached-rules" },
        ]);
        expect(state.values.fraudControlBypassCount).toBe(0);
        expect(state.values.riskControlPosture).toBe("fraud-controls-intact");
      });
    });

    describe("Recovery lag: protected shift relieves pressure but does not clear it instantly", () => {
      it("immediately after applying the correct protected-shift controls, lag/backlog are lower than baseline but not yet zero", () => {
        const justAfter = runScenario(REPLICATION_LAG_ONSET_MS + 10_000, PROTECTED_SHIFT_ACTIONS);
        expect(justAfter.transitions.incidentState).toBe("protected-shift-draining");
        expect(justAfter.values.ledgerReplicationLagSeconds).toBeGreaterThan(0);
        expect(justAfter.values.settlementBacklogThousands).toBeGreaterThan(0);
      });

      it("only after the real elapsed catch-up window does the fully-drained state appear", () => {
        const drained = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 5_000, PROTECTED_SHIFT_ACTIONS);
        expect(drained.transitions.incidentState).toBe("protected-shift-recovered");
        expect(drained.values.ledgerReplicationLagSeconds).toBeLessThanOrEqual(5);
        expect(drained.values.settlementBacklogThousands).toBe(0);
      });

      it("the drained state is reached strictly later in simulated time than the draining state for the same control combination", () => {
        const draining = runScenario(CATCHUP_WINDOW_ELAPSED_MS - 10_000, PROTECTED_SHIFT_ACTIONS);
        const drained = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 5_000, PROTECTED_SHIFT_ACTIONS);
        expect(draining.transitions.incidentState).toBe("protected-shift-draining");
        expect(drained.transitions.incidentState).toBe("protected-shift-recovered");
        expect(drained.values.settlementBacklogThousands as number).toBeLessThan(
          draining.values.settlementBacklogThousands as number,
        );
      });
    });

    describe("Multi-step path", () => {
      it("first mitigation (ledger authority) alone leaves capacity pressure unaddressed", () => {
        const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
        ]);
        expect(state.values.divergentLedgerAuthorityCount).toBe(0);
        expect(state.transitions.incidentState).toBe("baseline-unmitigated");
      });

      it("second mitigation (partial shift) on top of the first starts relieving EU without yet protecting settlement", () => {
        const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
          { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
        ]);
        expect(state.transitions.incidentState).toBe("ledger-fixed-partial-shift-unprotected");
        expect(state.values.divergentLedgerAuthorityCount).toBe(0);
        expect(state.values.ledgerAuthorityMechanism).toBe("us-authoritative-routed");
        // Settlement is still under real, elevated pressure -- not yet
        // protected by the third step.
        expect(state.values.settlementBacklogThousands).toBeGreaterThan(6);
      });

      it("third mitigation (settlement + throttle protection) completes the full protected-shift sequence", () => {
        const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, PROTECTED_SHIFT_ACTIONS);
        expect(state.transitions.incidentState).toBe("protected-shift-draining");
      });
    });

    describe("Alternate strong path", () => {
      it("the conservative 70%-local path reaches a genuinely safe drained state with lower peak US ledger pressure", () => {
        const primaryDrained = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 5_000, PROTECTED_SHIFT_ACTIONS);

        const alternateActions: TimedAction[] = [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
          { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 70 },
          { atMs: REPLICATION_LAG_ONSET_MS + 3_000, controlKey: RISK_ENRICHMENT_MODE_KEY, value: "optional-skip" },
          { atMs: REPLICATION_LAG_ONSET_MS + 4_000, controlKey: SETTLEMENT_WORKER_PRIORITY_KEY, value: "critical-path-first" },
        ];
        const alternateDrained = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 5_000, alternateActions);

        expect(alternateDrained.transitions.incidentState).toBe("alternate-conservative-shift-recovered");
        expect(alternateDrained.values.divergentLedgerAuthorityCount).toBe(0);
        expect(alternateDrained.peaks.peakValues.usLedgerUtilization as number).toBeLessThan(
          primaryDrained.peaks.peakValues.usLedgerUtilization as number,
        );
      });
    });

    describe("Automatic failure", () => {
      it("fails if divergent ledger authority persists severely for the full sustained window", () => {
        const state = runScenario(REPLICATION_LAG_ONSET_MS + 61_000, [
          { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 0 },
        ]);
        expect(state.status).toBe("failed");
        expect(state.failedAtMs).not.toBeNull();
      });
    });

    it("tracks peak settlement backlog and ledger utilization generically via numericWatchFields", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
        { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 0 },
      ]);
      expect(state.peaks.peakValues.usLedgerUtilization).toBeGreaterThan(100);
      expect(state.peaks.peakValues.settlementBacklogThousands).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts is moot: no incident has started yet", () => {
      const state = runScenario(EU_DEPENDENCY_DEGRADED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("protected-shift-draining is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 20_000 + 30_000, PROTECTED_SHIFT_ACTIONS);
      const eligibility = evaluateCompletionEligibility(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("protected-shift-recovered (post catch-up window) is Finish-eligible as optimal", () => {
      const state = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 35_000, PROTECTED_SHIFT_ACTIONS);
      const eligibility = evaluateCompletionEligibility(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("us-ledger-overloaded (the harmful path) is never Finish-eligible at any tier", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 60_000, [
        { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
        { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 0 },
      ]);
      const eligibility = evaluateCompletionEligibility(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("Finish from the fully-drained protected-shift path -> resolved/optimal", () => {
      const state = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 35_000, PROTECTED_SHIFT_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(REPLICATION_LAG_ONSET_MS + 61_000, [
        { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 0 },
      ]);
      const result = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 5_000, PROTECTED_SHIFT_ACTIONS);
      const runB = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 5_000, PROTECTED_SHIFT_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal, acceptable, alternate-strong, baseline, and harmful paths with coherent discrimination", () => {
      const optimalState = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 35_000, PROTECTED_SHIFT_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractFinishScoringInputs(multiRegionPaymentPlatformDegradationSimulation, optimalFinish),
      );

      const acceptableState = runScenario(REPLICATION_LAG_ONSET_MS + 20_000 + 30_000, PROTECTED_SHIFT_ACTIONS);
      const acceptableFinish = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractFinishScoringInputs(multiRegionPaymentPlatformDegradationSimulation, acceptableFinish),
      );

      const alternateActions: TimedAction[] = [
        { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
        { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 70 },
        { atMs: REPLICATION_LAG_ONSET_MS + 3_000, controlKey: RISK_ENRICHMENT_MODE_KEY, value: "optional-skip" },
        { atMs: REPLICATION_LAG_ONSET_MS + 4_000, controlKey: SETTLEMENT_WORKER_PRIORITY_KEY, value: "critical-path-first" },
      ];
      const alternateState = runScenario(CATCHUP_WINDOW_ELAPSED_MS + 35_000, alternateActions);
      const alternateFinish = evaluateCandidateDeclaredFinish(multiRegionPaymentPlatformDegradationSimulation, alternateState);
      const alternateScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractFinishScoringInputs(multiRegionPaymentPlatformDegradationSimulation, alternateFinish),
      );

      // Baseline and the harmful path never Finish -- scored via the
      // unresolved terminal override, no synthetic resolvedAtMs.
      const baselineState = runScenario(REPLICATION_LAG_ONSET_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractScoringInputs(multiRegionPaymentPlatformDegradationSimulation, baselineState),
      );

      const harmfulState = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
        { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 0 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractScoringInputs(multiRegionPaymentPlatformDegradationSimulation, harmfulState),
      );

      const fraudBypassState = runScenario(EU_DEPENDENCY_DEGRADED_MS + 5_000, [
        { atMs: EU_DEPENDENCY_DEGRADED_MS + 1_000, controlKey: FRAUD_FALLBACK_MODE_KEY, value: "bypass" },
      ]);
      const fraudBypassScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractScoringInputs(multiRegionPaymentPlatformDegradationSimulation, fraudBypassState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(optimalScore.total).toBe(930);
      expect(acceptableScore.total).toBe(880);
      expect(alternateScore.total).toBe(930);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(515);
      expect(fraudBypassScore.total).toBe(375);

      // ── Suspicious-score sanity checks (phase6dsupport.md section 16) ──

      // (1) Harmful path does not score too high: strictly below both
      // acceptable and optimal.
      expect(harmfulScore.total).toBeLessThan(acceptableScore.total);
      expect(harmfulScore.total).toBeLessThan(optimalScore.total);

      // (2) No-action baseline does not score too high either.
      expect(baselineScore.total).toBeLessThan(acceptableScore.total);

      // (3) An availability-good/correctness-bad path (fraud bypass)
      // never scores anywhere near optimal, despite payment throughput
      // recovering.
      expect(fraudBypassScore.total).toBeLessThan(optimalScore.total / 2);
      expect(fraudBypassScore.breakdown.dataIntegrity).toBeLessThanOrEqual(40);

      // (4) Acceptable is never greater than optimal.
      expect(acceptableScore.total).toBeLessThanOrEqual(optimalScore.total);

      // Both genuinely safe paths score full dataIntegrity marks; the
      // correctness-violating paths never do, regardless of how healthy
      // payment throughput reads.
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(200);
      expect(harmfulScore.breakdown.dataIntegrity).toBe(200); // ledger authority was fixed; this is a pure capacity trap
      expect(fraudBypassScore.breakdown.dataIntegrity).toBe(40);

      const divergentAuthorityState = runScenario(REPLICATION_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
      ]);
      const divergentAuthorityScore = scoreAuthoredAttempt(
        MULTI_REGION_PAYMENT_PLATFORM_DEGRADATION_SCORING,
        extractScoringInputs(multiRegionPaymentPlatformDegradationSimulation, divergentAuthorityState),
      );
      expect(divergentAuthorityScore.breakdown.dataIntegrity).toBe(40);
      expect(divergentAuthorityScore.total).toBeLessThan(optimalScore.total / 2);
    });
  });
});
