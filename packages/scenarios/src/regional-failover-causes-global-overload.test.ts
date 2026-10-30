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
import { regionalFailoverCausesGlobalOverload } from "./regional-failover-causes-global-overload";
import {
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
  regionalFailoverSimulation,
} from "./regional-failover-causes-global-overload/definition";
import { regionalFailoverCandidateUI } from "./regional-failover-causes-global-overload/candidate-ui";
import { REGIONAL_FAILOVER_SCORING } from "./regional-failover-causes-global-overload/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(regionalFailoverSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += regionalFailoverSimulation.tickMs
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
      regionalFailoverSimulation,
      state,
      action,
      regionalFailoverSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const REGION_A_FAILS_MS = 30_000;
const REGION_A_CAPACITY_RETURNS_MS = REGION_A_FAILS_MS + 3 * 60_000;
const REGION_BC_DRAIN_WINDOW_ELAPSED_MS = REGION_A_CAPACITY_RETURNS_MS + 2 * 60_000;

// Shorthand action chain: cap at 80, shed optional, protect cache+DB --
// the capacity-managed-full-protection path.
const CAPACITY_MANAGED_ACTIONS: TimedAction[] = [
  { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 80 },
  { atMs: REGION_A_FAILS_MS + 1_000, controlKey: LOW_PRIORITY_TRAFFIC_KEY, value: "shed" },
  { atMs: REGION_A_FAILS_MS + 1_000, controlKey: CACHE_PROTECTION_KEY, value: "on" },
  { atMs: REGION_A_FAILS_MS + 1_000, controlKey: DB_CONCURRENCY_KEY, value: "capped" },
];

describe("Regional Failover Causes Global Overload", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(regionalFailoverCausesGlobalOverload.isFree).toBe(false);
      expect(regionalFailoverCausesGlobalOverload.library?.category).toBe("Distributed Systems");
      expect(regionalFailoverCausesGlobalOverload.library?.tags.length).toBeGreaterThan(0);
      expect(regionalFailoverCausesGlobalOverload.library?.skills.length).toBeGreaterThan(0);
      expect(regionalFailoverCausesGlobalOverload.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = REGIONAL_FAILOVER_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = REGIONAL_FAILOVER_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components", () => {
      expect(regionalFailoverCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(regionalFailoverCandidateUI.controls.length).toBe(6);
      expect(regionalFailoverCandidateUI.components.length).toBe(10);
    });

    it("the briefing explicitly states all four business invariants", () => {
      const d = regionalFailoverCausesGlobalOverload.description;
      expect(d).toMatch(/critical customer operations must remain available/i);
      expect(d).toMatch(/optional.*traffic.*may be shed/i);
      expect(d).toMatch(/healthy regions must not be driven into failure/i);
      expect(d).toMatch(/partial.*preferable.*global collapse|preferable to letting the incident spread into a global collapse/i);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(regionalFailoverSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.secondRegionRiskStatus).toBe("normal");
      expect(state.values.containmentMechanism).toBe("uncontained");
    });

    it("Region A failure triggers the incident; default config (no mitigation) goes critical with second-region risk", () => {
      const state = runScenario(REGION_A_FAILS_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REGION_A_FAILS_MS);
      expect(state.status).toBe("critical");
      expect(state.values.secondRegionRiskStatus).toBe("critical");
      expect(state.values.regionBApiUtilization).toBeGreaterThan(100);
      expect(state.values.regionCApiUtilization).toBeGreaterThan(100);
    });

    it("strong path: capping failover at the critical floor + shedding optional + protecting cache/DB keeps Region B/C safe", () => {
      const state = runScenario(REGION_A_FAILS_MS + 40_000, CAPACITY_MANAGED_ACTIONS);
      expect(state.values.secondRegionRiskStatus).toBe("normal");
      expect(state.values.regionACriticalTrafficDroppedPct).toBe(0);
      expect(state.values.regionBApiUtilization).toBeLessThan(100);
      expect(state.values.regionCApiUtilization).toBeLessThan(100);
      expect(state.values.containmentMechanism).toBe("capacity-managed-full");
    });

    it("harmful path (the named tempting path): leaving failover fully uncapped overloads both Region B and Region C", () => {
      const state = runScenario(REGION_A_FAILS_MS + 40_000);
      expect(state.values.secondRegionRiskStatus).toBe("critical");
      expect(state.values.regionBApiUtilization).toBeGreaterThan(100);
      expect(state.values.regionCApiUtilization).toBeGreaterThan(100);
      expect(state.values.regionBDbUtilization).toBeGreaterThanOrEqual(150);
      expect(state.values.regionCDbUtilization).toBeGreaterThanOrEqual(150);
      expect(state.values.regionBCacheHitRate).toBeLessThan(50);
      expect(state.values.globalSuccessRate).toBeLessThan(40);
    });

    it("a different harmful path: capping failover below the critical floor without shedding drops real critical traffic while Region B/C look perfectly healthy", () => {
      const state = runScenario(REGION_A_FAILS_MS + 40_000, [
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 25 },
      ]);
      expect(state.values.secondRegionRiskStatus).toBe("normal");
      expect(state.values.regionBApiUtilization).toBeLessThan(100);
      expect(state.values.regionCApiUtilization).toBeLessThan(100);
      // The trap: Region B/C read healthy, but critical traffic is being
      // dropped outright.
      expect(state.values.regionACriticalTrafficDroppedPct).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(regionalFailoverSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("delayed consequence / pressure transfer: relieving Region A's outage via uncapped failover measurably worsens both Region B and Region C simultaneously", () => {
      const baseline = runScenario(REGION_A_FAILS_MS - 1_000);
      expect(baseline.values.regionBApiUtilization).toBe(70);
      expect(baseline.values.regionCApiUtilization).toBe(70);

      const afterUncappedFailover = runScenario(REGION_A_FAILS_MS + 10_000);
      expect(afterUncappedFailover.values.regionBApiUtilization).toBeGreaterThan(
        baseline.values.regionBApiUtilization as number,
      );
      expect(afterUncappedFailover.values.regionCApiUtilization).toBeGreaterThan(
        baseline.values.regionCApiUtilization as number,
      );
      expect(afterUncappedFailover.values.regionBCustomerSuccessPct).toBeLessThan(100);
      expect(afterUncappedFailover.values.regionCCustomerSuccessPct).toBeLessThan(100);
    });

    it("stays active (never auto-fails) even after second-region risk remains critical past the old sustained window", () => {
      const state = runScenario(REGION_A_FAILS_MS + 91_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        regionalFailoverSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("tracks peak queue depth and DB utilization generically via numericWatchFields", () => {
      const state = runScenario(REGION_A_FAILS_MS + 10_000);
      expect(state.peaks.peakValues.queueDepth).toBeGreaterThan(0);
      expect(state.peaks.peakValues.regionBDbUtilization).toBeGreaterThan(0);
    });
  });

  describe("Multi-step", () => {
    it("first mitigation (cap alone) then secondary consequence then second mitigation (shed) reaches the safe state", () => {
      const capOnly = runScenario(REGION_A_FAILS_MS + 10_000, [
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 80 },
      ]);
      // Cap alone, without shedding, does not yet reach the full
      // protection state -- it falls to the unmanaged fallback.
      expect(capOnly.values.containmentMechanism).toBe("uncontained");

      const capThenShed = runScenario(REGION_A_FAILS_MS + 10_000, [
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 80 },
        { atMs: REGION_A_FAILS_MS + 2_000, controlKey: LOW_PRIORITY_TRAFFIC_KEY, value: "shed" },
      ]);
      expect(capThenShed.values.regionACriticalTrafficDroppedPct).toBe(0);
      expect(capThenShed.values.secondRegionRiskStatus).not.toBe("critical");

      const fullChain = runScenario(REGION_A_FAILS_MS + 10_000, CAPACITY_MANAGED_ACTIONS);
      expect(fullChain.values.containmentMechanism).toBe("capacity-managed-full");
      expect(fullChain.values.secondRegionRiskStatus).toBe("normal");
    });
  });

  describe("Sequencing", () => {
    it("safe sequence: protect Region B/C first (capacity-managed), THEN restore Region A traffic gradually after the drain window elapses -> stays safe throughout", () => {
      const state = runScenario(REGION_BC_DRAIN_WINDOW_ELAPSED_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      expect(state.values.secondRegionRiskStatus).toBe("normal");
      expect(state.values.containmentMechanism).toBe("restored-safely");
      expect(state.status).not.toBe("failed");
    });

    it("unsafe sequence: restore Region A traffic INSTANTLY the moment capacity returns, before Region B/C have drained -> retriggers the overload", () => {
      const state = runScenario(REGION_A_CAPACITY_RETURNS_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "instant" },
      ]);
      expect(state.values.secondRegionRiskStatus).toBe("critical");
      expect(state.values.containmentMechanism).toBe("retriggered");
    });

    it("the unsafe-sequence retrigger, if sustained, breaches the old failure window but never auto-fails just like the original trap", () => {
      const state = runScenario(REGION_A_CAPACITY_RETURNS_MS + 110_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "instant" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        regionalFailoverSimulation.failureCondition.sustainedSeconds,
      );
    });

    it("REGION_A_RESTORATION_KEY left at its 'offline' default after capacity returns restores no traffic at all, even with pace set to gradual -- the candidate must actually act on the control, not just rely on Region A's own reported health", () => {
      const restorationLeftOffline = runScenario(REGION_A_CAPACITY_RETURNS_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      // REGION_A_RESTORATION_KEY was never moved off "offline" above --
      // Region A's traffic share must still read as fully unrestored.
      expect(restorationLeftOffline.values.regionATrafficPct).toBe(0);
      expect(restorationLeftOffline.values.containmentMechanism).toBe("capacity-managed-full");

      // Compare against actually declaring "full" restoration with the
      // same gradual pace at the same point in time: traffic genuinely
      // comes back.
      const restorationDeclaredFull = runScenario(REGION_A_CAPACITY_RETURNS_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      expect(restorationDeclaredFull.values.regionATrafficPct).toBeGreaterThan(
        restorationLeftOffline.values.regionATrafficPct as number,
      );
    });

    it("partial restoration mode brings back only HALF of Region A's original traffic share, a genuinely smaller and distinct outcome from full restoration, even under the same gradual pace", () => {
      const partialGradual = runScenario(REGION_A_CAPACITY_RETURNS_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "partial" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      expect(partialGradual.values.regionATrafficPct).toBe(25);
      expect(partialGradual.values.secondRegionRiskStatus).toBe("normal");
      expect(partialGradual.values.regionACriticalTrafficDroppedPct).toBe(0);

      const fullGradual = runScenario(REGION_A_CAPACITY_RETURNS_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      // Partial restoration is a real, smaller traffic shift than full --
      // not merely a relabeling of the same outcome.
      expect(partialGradual.values.regionATrafficPct).toBeLessThan(
        fullGradual.values.regionATrafficPct as number,
      );
    });

    it("partial restoration mode does NOT make an instant restore pace safe -- shifting even the smaller partial share all at once still retriggers second-region risk", () => {
      const partialInstant = runScenario(REGION_A_CAPACITY_RETURNS_MS + 10_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "partial" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "instant" },
      ]);
      expect(partialInstant.values.secondRegionRiskStatus).toBe("critical");
      expect(partialInstant.values.containmentMechanism).toBe("retriggered");
      expect(partialInstant.values.regionATrafficPct).toBe(25);
    });
  });

  describe("Completion mode: candidate_declared, with a real acceptable tier", () => {
    it("full protection mid-incident is eligible (optimal tier) even though Region A is still offline", () => {
      const state = runScenario(REGION_A_FAILS_MS + 40_000, CAPACITY_MANAGED_ACTIONS);
      const eligibility = evaluateCompletionEligibility(regionalFailoverSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("partial protection (cap+shed, DB capped, cache protection left off) is eligible only at the acceptable tier", () => {
      const state = runScenario(REGION_A_FAILS_MS + 40_000, [
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 80 },
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: LOW_PRIORITY_TRAFFIC_KEY, value: "shed" },
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: DB_CONCURRENCY_KEY, value: "capped" },
      ]);
      const eligibility = evaluateCompletionEligibility(regionalFailoverSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("Finish from the fully restored, drained end-state -> resolved/optimal", () => {
      const state = runScenario(REGION_BC_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      const result = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(REGION_A_FAILS_MS + 40_000);
      const result = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("declared_unstable still fires regardless of how long the breach has sustained, even though the engine never auto-fails", () => {
      const state = runScenario(REGION_A_FAILS_MS + 91_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    describe("Immediate-Finish audit", () => {
      it("a zero-action Finish issued the instant Region A fails does NOT resolve (the uncapped-failover trap engages immediately under default routing)", () => {
        const state = runScenario(REGION_A_FAILS_MS + 1_000);
        const result = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("a zero-action Finish issued before Region A fails is moot: no incident has started yet", () => {
        const state = runScenario(REGION_A_FAILS_MS - 5_000);
        expect(state.incidentStartedAtMs).toBeNull();
        const result = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, state);
        expect(result.outcome).toBe("declared_unstable");
      });

      it("even the correct fix requires the full 30s sustained window before Finish is eligible", () => {
        const justFixed = runScenario(REGION_A_FAILS_MS + 10_000, CAPACITY_MANAGED_ACTIONS);
        expect(justFixed.values.secondRegionRiskStatus).toBe("normal");
        const eligibility = evaluateCompletionEligibility(regionalFailoverSimulation, justFixed);
        expect(eligibility.eligible).toBe(false);
        expect(justFixed.transitions.consecutiveSuccessSeconds).toBeLessThan(
          regionalFailoverSimulation.successCondition.sustainedSeconds,
        );
      });
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(REGION_A_FAILS_MS + 40_000, CAPACITY_MANAGED_ACTIONS);
      const runB = runScenario(REGION_A_FAILS_MS + 40_000, CAPACITY_MANAGED_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal (full protection), acceptable (partial protection), baseline (unresolved), and harmful (uncapped) with coherent ordering", () => {
      const optimalState = runScenario(REGION_A_FAILS_MS + 40_000, CAPACITY_MANAGED_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractFinishScoringInputs(regionalFailoverSimulation, optimalFinish),
      );

      const acceptableState = runScenario(REGION_A_FAILS_MS + 40_000, [
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 80 },
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: LOW_PRIORITY_TRAFFIC_KEY, value: "shed" },
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: DB_CONCURRENCY_KEY, value: "capped" },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractFinishScoringInputs(regionalFailoverSimulation, acceptableFinish),
      );

      // Baseline: never acted, never Finish-eligible -- scored via the
      // unresolved terminal override, no synthetic resolvedAtMs.
      const baselineState = runScenario(REGION_A_FAILS_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractScoringInputs(regionalFailoverSimulation, baselineState),
      );

      // Harmful: same uncapped state as baseline, but held long enough to
      // accrue real revenue loss and critical time before being scored
      // mid-incident (still never Finish-eligible).
      const harmfulState = runScenario(REGION_A_FAILS_MS + 85_000);
      const harmfulScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractScoringInputs(regionalFailoverSimulation, harmfulState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(optimalScore.total).toBe(845);
      expect(acceptableScore.total).toBe(705);
      expect(baselineScore.total).toBe(290);
      expect(harmfulScore.total).toBe(190);

      // Sanity checks against the mandatory failure modes
      // (phase6dsupport.md section 16):
      // (1) harmful must not score anywhere close to optimal.
      expect(harmfulScore.total).toBeLessThan(optimalScore.total * 0.5);
      // (2) no-action baseline must not score highly.
      expect(baselineScore.total).toBeLessThan(500);
      // (3) acceptable must never exceed optimal.
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      // (4) availability-good/correctness-bad trap (cap-too-low, dropping
      // real critical traffic while Region B/C read perfectly healthy)
      // must not score near optimal.
      const trapState = runScenario(REGION_A_FAILS_MS + 85_000, [
        { atMs: REGION_A_FAILS_MS + 1_000, controlKey: FAILOVER_CAP_KEY, value: 25 },
      ]);
      const trapScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractScoringInputs(regionalFailoverSimulation, trapState),
      );
      expect(trapScore.total).toBeLessThan(optimalScore.total * 0.6);
      expect(trapScore.breakdown.dataIntegrity).toBeLessThan(optimalScore.breakdown.dataIntegrity);
    });

    it("alternate strong path: declaring Finish mid-incident (full protection, Region A still offline) and continuing on to the fully restored end-state are BOTH genuinely optimal on dataIntegrity -- a candidate is not penalized for recognizing the system is safe to hand back before Region A itself has recovered", () => {
      const midIncidentState = runScenario(REGION_A_FAILS_MS + 40_000, CAPACITY_MANAGED_ACTIONS);
      const midIncidentFinish = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, midIncidentState);
      expect(midIncidentFinish.completionTier).toBe("optimal");
      const midIncidentScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractFinishScoringInputs(regionalFailoverSimulation, midIncidentFinish),
      );

      const fullyRestoredState = runScenario(REGION_BC_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      const fullyRestoredFinish = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, fullyRestoredState);
      const fullyRestoredScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractFinishScoringInputs(regionalFailoverSimulation, fullyRestoredFinish),
      );

      // Both are real, independently-OPTIMAL mechanisms (never dropped
      // critical traffic, never risked a second region) -- dataIntegrity
      // deliberately does not penalize the mid-incident handback relative
      // to the fully-restored one.
      expect(midIncidentScore.breakdown.dataIntegrity).toBe(200);
      expect(fullyRestoredScore.breakdown.dataIntegrity).toBe(200);

      // The fully-restored path takes materially longer wall-clock time
      // to reach (it waits out the real drain window), which Recovery
      // genuinely penalizes -- a real, authored tradeoff between
      // handing back sooner vs. waiting for the complete, no-longer-
      // degraded end-state.
      expect(fullyRestoredScore.breakdown.recovery).toBeLessThanOrEqual(
        midIncidentScore.breakdown.recovery,
      );
    });

    it("the retriggered recovery failure scores far below the safely-restored path", () => {
      const retriggeredState = runScenario(REGION_A_CAPACITY_RETURNS_MS + 85_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "instant" },
      ]);
      const retriggeredScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractScoringInputs(regionalFailoverSimulation, retriggeredState),
      );

      const safelyRestoredState = runScenario(REGION_BC_DRAIN_WINDOW_ELAPSED_MS + 40_000, [
        ...CAPACITY_MANAGED_ACTIONS,
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: REGION_A_RESTORATION_KEY, value: "full" },
        { atMs: REGION_A_CAPACITY_RETURNS_MS + 1_000, controlKey: TRAFFIC_RESTORE_PACE_KEY, value: "gradual" },
      ]);
      const safelyRestoredFinish = evaluateCandidateDeclaredFinish(regionalFailoverSimulation, safelyRestoredState);
      const safelyRestoredScore = scoreAuthoredAttempt(
        REGIONAL_FAILOVER_SCORING,
        extractFinishScoringInputs(regionalFailoverSimulation, safelyRestoredFinish),
      );

      expect(retriggeredScore.total).toBeLessThan(safelyRestoredScore.total);
    });
  });
});
