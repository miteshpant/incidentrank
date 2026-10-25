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
import { unevenTenantTraffic } from "./uneven-tenant-traffic";
import {
  CACHING_ENABLED_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  unevenTenantTrafficSimulation,
  WORKLOAD_ROUTING_KEY,
} from "./uneven-tenant-traffic/definition";
import { unevenTenantTrafficCandidateUI } from "./uneven-tenant-traffic/candidate-ui";
import { UNEVEN_TENANT_TRAFFIC_SCORING } from "./uneven-tenant-traffic/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(unevenTenantTrafficSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += unevenTenantTrafficSimulation.tickMs
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
      unevenTenantTrafficSimulation,
      state,
      action,
      unevenTenantTrafficSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const HOT_TENANT_TRAFFIC_RISING_MS = 30_000;
const DATA_LAYER_SATURATING_MS = HOT_TENANT_TRAFFIC_RISING_MS + 3 * 60_000;

describe("Uneven Tenant Traffic", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(unevenTenantTraffic.isFree).toBe(false);
      expect(unevenTenantTraffic.library?.category).toBe("API & Traffic");
      expect(unevenTenantTraffic.library?.tags.length).toBeGreaterThan(0);
      expect(unevenTenantTraffic.library?.skills.length).toBeGreaterThan(0);
      expect(unevenTenantTraffic.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = UNEVEN_TENANT_TRAFFIC_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = UNEVEN_TENANT_TRAFFIC_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(unevenTenantTrafficCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(unevenTenantTrafficCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(unevenTenantTrafficCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(unevenTenantTrafficCandidateUI.components.length).toBe(4);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(unevenTenantTrafficSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.hotTenantQps).toBe(180);
      expect(state.values.tenantFairnessMode).toBe("unresolved");
    });

    it("hot tenant traffic rising triggers the baseline incident, degrading OTHER tenants while the hot tenant stays fast", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(HOT_TENANT_TRAFFIC_RISING_MS);
      expect(state.status).toBe("critical");
      expect(state.values.hotTenantQps).toBe(6_800);
      expect(state.values.otherTenantLatencyMs).toBe(260);
      expect(state.values.sharedFleetStatus).toBe("critical");
    });

    it("strong path: strict per-tenant quota restores other tenants' latency at a visible cost to the hot tenant's own throughput", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ]);
      expect(state.values.sharedFleetStatus).toBe("normal");
      expect(state.values.otherTenantLatencyMs).toBeLessThanOrEqual(50);
      expect(state.values.tenantFairnessMode).toBe("fair-share-restored");
      expect(state.values.throttledRequestRatePerSec).toBeGreaterThan(0);
    });

    it("alternate good path: tenant isolation protects everyone with zero throttle cost, at real infrastructure cost", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: TENANT_ISOLATION_KEY, value: true },
      ]);
      expect(state.values.sharedFleetStatus).toBe("normal");
      expect(state.values.otherTenantLatencyMs).toBeLessThanOrEqual(50);
      expect(state.values.tenantFairnessMode).toBe("fair-share-restored");
      expect(state.values.throttledRequestRatePerSec).toBe(0);
    });

    it("alternate good path: dedicated workload lane caps the hot tenant's share without new infrastructure", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: WORKLOAD_ROUTING_KEY, value: "dedicatedLane" },
      ]);
      expect(state.values.sharedFleetStatus).toBe("normal");
      expect(state.values.otherTenantLatencyMs).toBeLessThanOrEqual(50);
      expect(state.values.tenantFairnessMode).toBe("fair-share-restored");
      expect(state.values.throttledRequestRatePerSec).toBeGreaterThan(0);
    });

    it("harmful/trap path: scaling the shared fleet alone makes the fleet LOOK healthy while other tenants stay degraded", () => {
      const baseline = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000);
      const scaled = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: GLOBAL_FLEET_SCALING_KEY, value: 16 },
      ]);

      // The fleet itself looks healthy...
      expect(scaled.values.sharedFleetStatus).toBe("critical");
      // ...wait, the shared DATA LAYER becomes critical instead, while the
      // fleet's own utilization looks fine — the trap's defining shape.
      expect(scaled.values.sharedFleetUtilizationPct).toBeLessThan(
        baseline.values.sharedFleetUtilizationPct as number,
      );
      expect(scaled.values.sharedDataLayerUtilizationPct).toBeGreaterThan(90);
      // Other tenants remain meaningfully degraded despite the scaled
      // fleet — proof scaling never restored fairness.
      expect(scaled.values.otherTenantLatencyMs).toBeGreaterThan(50);
      expect(scaled.values.tenantFairnessMode).toBe("scaled-only");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.sharedFleetStatus).toBe("critical");
    });

    it("partial path: deprioritizing the hot tenant reorders queueing but leaves real volume-driven pressure", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PRIORITY_CLASS_KEY, value: "deprioritizeHot" },
      ]);
      expect(state.values.sharedFleetStatus).toBe("warning");
      expect(state.values.tenantFairnessMode).toBe("unresolved");
    });

    it("partial path: caching alone only helps the readable share of a write-heavy hot-tenant workload", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: CACHING_ENABLED_KEY, value: true },
      ]);
      expect(state.values.sharedFleetStatus).toBe("warning");
      expect(state.values.tenantFairnessMode).toBe("unresolved");
    });

    it("partial path: moderate quota trims bursts but leaves sustained pressure", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "moderate" },
      ]);
      expect(state.values.sharedFleetStatus).toBe("warning");
      expect(state.values.tenantFairnessMode).toBe("unresolved");
    });

    it("delayed consequence: sustained unmitigated hot-tenant traffic saturates the shared data layer on a second wave, with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.sharedDataLayerUtilizationPct).toBeGreaterThan(0);
      expect(beforeSecondWave.values.otherTenantLatencyMs).toBeGreaterThan(50);

      const afterSecondWave = runScenario(DATA_LAYER_SATURATING_MS + 5_000);
      expect(afterSecondWave.values.sharedFleetStatus).toBe("critical");
      expect(afterSecondWave.values.sharedDataLayerUtilizationPct).toBe(99);
    });

    it("fails if shared data layer utilization stays at or above 98% for the full sustained window", () => {
      const state = runScenario(DATA_LAYER_SATURATING_MS + 61_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak other-tenant latency and peak hot-tenant QPS generically via numericWatchFields", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: GLOBAL_FLEET_SCALING_KEY, value: 16 },
      ]);
      expect(state.peaks.peakValues.otherTenantLatencyMs).toBeGreaterThan(0);
      expect(state.peaks.peakValues.hotTenantQps).toBe(8_200);
    });

    it("tracks monthly infrastructure cost that increases with tenant isolation and fleet scaling", () => {
      let state = createInitialState(unevenTenantTrafficSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(500);

      const tickMs = unevenTenantTrafficSimulation.tickMs;
      state = simulate(
        unevenTenantTrafficSimulation,
        state,
        { id: "isolate", timestampMs: 0, controlKey: TENANT_ISOLATION_KEY, value: true },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(500 + 900);
    });
  });

  describe("Phase 6.1: three-tier completion — hot-tenant-throttled/lane-capped (optimal) vs hot-tenant-isolated (acceptable)", () => {
    it("strict quota, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("dedicated lane, sustained, is also eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: WORKLOAD_ROUTING_KEY, value: "dedicatedLane" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("tenant isolation, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: TENANT_ISOLATION_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("fleet-scaled trap remains ineligible for any Finish tier despite a healthy-looking fleet utilization", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: GLOBAL_FLEET_SCALING_KEY, value: 16 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("moderate quota alone remains ineligible for any Finish tier", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "moderate" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        unevenTenantTrafficSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: TENANT_ISOLATION_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        unevenTenantTrafficSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ]);
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: TENANT_ISOLATION_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from the fleet-scaled trap -> declared_unstable, despite a healthy-looking fleet", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: GLOBAL_FLEET_SCALING_KEY, value: 16 },
      ]);
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(DATA_LAYER_SATURATING_MS + 61_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate zero-action Finish at the very start of the incident does NOT resolve prematurely", () => {
      const state = runScenario(1_000);
      expect(state.status).toBe("healthy");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("immediate zero-action Finish right as the incident starts does NOT resolve prematurely", () => {
      const state = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 1_000);
      expect(state.status).toBe("critical");
      const eligibility = evaluateCompletionEligibility(unevenTenantTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ];
      const runA = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, actions);
      const runB = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state, events, and score for an isolation action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: TENANT_ISOLATION_KEY, value: true },
      ];
      const runA = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, actions);
      const runB = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 20_000, actions);
      expect(runA).toEqual(runB);

      const scoreA = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractScoringInputs(unevenTenantTrafficSimulation, runA),
      );
      const scoreB = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractScoringInputs(unevenTenantTrafficSimulation, runB),
      );
      expect(scoreA).toEqual(scoreB);
    });
  });

  describe("Scoring", () => {
    it("scores good (strict quota), acceptable (isolation), baseline, and harmful (fleet scaling) paths with coherent ordering", () => {
      const goodState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractFinishScoringInputs(unevenTenantTrafficSimulation, goodFinish),
      );

      const acceptableState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: TENANT_ISOLATION_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        unevenTenantTrafficSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractFinishScoringInputs(unevenTenantTrafficSimulation, acceptableFinish),
      );

      const laneState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: WORKLOAD_ROUTING_KEY, value: "dedicatedLane" },
      ]);
      const laneFinish = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, laneState);
      const laneScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractFinishScoringInputs(unevenTenantTrafficSimulation, laneFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000);
      const baselineScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractScoringInputs(unevenTenantTrafficSimulation, baselineState),
      );

      const harmfulState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: GLOBAL_FLEET_SCALING_KEY, value: 16 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractScoringInputs(unevenTenantTrafficSimulation, harmfulState),
      );

      // Immediate zero-action Finish score, for comparison against
      // every other path (section 17's "flag immediate no-action Finish
      // unusually high" check) — this never reaches Finish eligibility
      // either, so it scores via the same unresolved terminal override.
      const immediateState = runScenario(1_000);
      const immediateScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractScoringInputs(unevenTenantTrafficSimulation, immediateState),
      );

      // Executed totals, read directly from the real scorer run above.
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(790);
      expect(laneScore.total).toBe(865);
      expect(baselineScore.total).toBe(390);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);

      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);
      expect(laneScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);
      // Immediate no-action Finish never scores above the real mitigation
      // paths, and is not suspiciously high relative to baseline.
      expect(immediateScore.total).toBeLessThan(acceptableScore.total);
      expect(immediateScore.total).toBeLessThanOrEqual(baselineScore.total);
    });

    it("scores the fleet-scaled trap as unresolved (never a disguised success) despite looking calm", () => {
      const trapState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: GLOBAL_FLEET_SCALING_KEY, value: 16 },
      ]);
      const trapScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractScoringInputs(unevenTenantTrafficSimulation, trapState),
      );

      const goodState = runScenario(HOT_TENANT_TRAFFIC_RISING_MS + 35_000, [
        { atMs: HOT_TENANT_TRAFFIC_RISING_MS + 1_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(unevenTenantTrafficSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        UNEVEN_TENANT_TRAFFIC_SCORING,
        extractFinishScoringInputs(unevenTenantTrafficSimulation, goodFinish),
      );

      expect(trapScore.total).toBeLessThan(goodScore.total);
    });
  });
});
