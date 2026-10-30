import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { mlInferenceCostVsQualityIncident } from "./ml-inference-cost-vs-quality-incident";
import {
  CLASSIFIER_REMEDIATION_KEY,
  CRITICAL_SEGMENT_POLICY_KEY,
  NON_CRITICAL_CACHE_REUSE_KEY,
  ROUTING_POLICY_KEY,
  SMALL_MODEL_QUALITY_FLOOR_KEY,
  mlInferenceCostVsQualityIncidentSimulation,
} from "./ml-inference-cost-vs-quality-incident/definition";
import { mlInferenceCostVsQualityIncidentCandidateUI } from "./ml-inference-cost-vs-quality-incident/candidate-ui";
import { ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING } from "./ml-inference-cost-vs-quality-incident/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS,
  CLASSIFIER_FIX_WINDOW_1_MS,
  MISROUTE_ONSET_MS,
  SUSTAINED_MISROUTE_MS,
} from "./ml-inference-cost-vs-quality-incident/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(mlInferenceCostVsQualityIncidentSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += mlInferenceCostVsQualityIncidentSimulation.tickMs
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
      mlInferenceCostVsQualityIncidentSimulation,
      state,
      action,
      mlInferenceCostVsQualityIncidentSimulation.tickMs,
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
    initialMonthlyInfrastructureCostUsd:
      mlInferenceCostVsQualityIncidentSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: classifier remediation (root-cause fix),
// routingPolicy left at its default "classifier-only".
const CLASSIFIER_FIX_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_MISROUTE_MS + 1_000, controlKey: CLASSIFIER_REMEDIATION_KEY, value: true },
];

// Alternate strong path B: explicit quality-tiering policy, immediate.
const QUALITY_TIERING_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_MISROUTE_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
];

describe("ML Inference Cost vs Quality Incident", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(mlInferenceCostVsQualityIncident.isFree).toBe(false);
      expect(mlInferenceCostVsQualityIncident.library?.category).toBe("Data Pipelines");
      expect(mlInferenceCostVsQualityIncident.library?.tags.length).toBeGreaterThan(0);
      expect(mlInferenceCostVsQualityIncident.library?.skills.length).toBeGreaterThan(0);
      expect(mlInferenceCostVsQualityIncident.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(mlInferenceCostVsQualityIncidentCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(mlInferenceCostVsQualityIncidentCandidateUI.controls.length).toBe(5);
      expect(mlInferenceCostVsQualityIncidentCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 5-edge fan-out matching the spec", () => {
      expect(mlInferenceCostVsQualityIncidentSimulation.architecture.nodes.length).toBe(5);
      expect(mlInferenceCostVsQualityIncidentSimulation.architecture.edges.length).toBe(5);
      for (const node of mlInferenceCostVsQualityIncidentSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(mlInferenceCostVsQualityIncident.description).toMatch(
        /quality-critical request classes must not be silently downgraded/i,
      );
      expect(mlInferenceCostVsQualityIncident.description).toMatch(
        /cost reduction must be achieved by smarter routing, not blanket quality sacrifice/i,
      );
      expect(mlInferenceCostVsQualityIncident.description).toMatch(
        /quality regression affecting real user-facing decisions must be trackable/i,
      );
      expect(mlInferenceCostVsQualityIncident.description).toMatch(
        /model-serving availability is not the primary objective/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of mlInferenceCostVsQualityIncidentSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (0 dead controls)", () => {
      const classifiedKeys = new Set(
        mlInferenceCostVsQualityIncidentSimulation.actionClassifications.map((r) => r.controlKey),
      );
      expect(mlInferenceCostVsQualityIncidentSimulation.controls.length).toBe(5);
      for (const control of mlInferenceCostVsQualityIncidentSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(mlInferenceCostVsQualityIncidentSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(state.values.cumulativeSilentCriticalDowngradeCount).toBe(0);
    });

    it("misroute onset triggers the incident with rising cost, never touching uptime/latency", () => {
      const state = runScenario(MISROUTE_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(MISROUTE_ONSET_MS);
      expect(state.values.routingLayerUptimePercent).toBe(99.97);
      expect(state.values.inferenceP99LatencyMs).toBe(180);
    });

    it("baseline (no action) compounds inference cost while uptime/latency stay perfect throughout (the core decoy)", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-misroute");
      expect(state.values.routingLayerUptimePercent).toBe(99.97);
      expect(state.values.inferenceP99LatencyMs).toBe(180);
      expect(state.values.monthlyInferenceCostUsd as number).toBeGreaterThan(10_000);
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
    });
  });

  describe("Required unsafe-tempting trap: blanket-small-model silently downgrades critical traffic while looking cheapest", () => {
    it("blanket-small-model + unprotected creates real, nonzero silent downgrade while cost collapses and serving metrics stay perfect", () => {
      const baseline = runScenario(SUSTAINED_MISROUTE_MS + 5_000);
      const trap = runScenario(SUSTAINED_MISROUTE_MS + 5_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      expect(trap.transitions.incidentState).toBe("blanket-small-model-unprotected-sustained");
      expect(trap.values.routingLayerUptimePercent).toBe(baseline.values.routingLayerUptimePercent);
      expect(trap.values.inferenceP99LatencyMs).toBe(baseline.values.inferenceP99LatencyMs);
      expect(trap.values.criticalTrafficSilentlyDowngradedPercent as number).toBeGreaterThan(0);
      expect(trap.values.cumulativeSilentCriticalDowngradeCount as number).toBeGreaterThan(0);
      expect(trap.values.qualityProtectionStatus).toBe("silently-downgraded");
      // Cheapest inference spend of any reachable state.
      expect(trap.values.monthlyInferenceCostUsd as number).toBeLessThan(baseline.values.monthlyInferenceCostUsd as number);
    });

    it("the trap held longer compounds the silent-downgrade count further", () => {
      const early = runScenario(MISROUTE_ONSET_MS + 10_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      const sustained = runScenario(SUSTAINED_MISROUTE_MS + 10_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      expect(sustained.values.cumulativeSilentCriticalDowngradeCount as number).toBeGreaterThan(
        early.values.cumulativeSilentCriticalDowngradeCount as number,
      );
    });

    it("the trap can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 60_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("sustained trap exposure stays active (never auto-fails) even long after the old sustained window, though the breach is tracked as genuinely sustained", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 15 * 60_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(30);
      const finish = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Defense-in-depth: pinning critical traffic protects it even under the cruder blanket-small-model policy", () => {
    it("blanket-small-model + always-large-model protects critical traffic (ACCEPTABLE), but non-critical quality is still blanket-sacrificed", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 5_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
        { atMs: MISROUTE_ONSET_MS + 2_000, controlKey: CRITICAL_SEGMENT_POLICY_KEY, value: "always-large-model" },
      ]);
      expect(state.transitions.incidentState).toBe("blanket-small-model-protected");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(state.values.qualityProtectionStatus).toBe("protected");
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Historical damage persistence: silent downgrade cannot be laundered into a safe outcome", () => {
    it("switching away from the trap stops NEW downgrades but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(SUSTAINED_MISROUTE_MS + 10_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      const correctedState = runScenario(SUSTAINED_MISROUTE_MS + 20_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
        { atMs: SUSTAINED_MISROUTE_MS + 11_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
      ]);
      expect(sealedUnsafeState.values.criticalTrafficSilentlyDowngradedPercent as number).toBeGreaterThan(0);
      expect(correctedState.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(correctedState.peaks.peakValues.cumulativeSilentCriticalDowngradeCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeSilentCriticalDowngradeCount as number,
      );
    });

    it("full remediation after an unsafe window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 20_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
        { atMs: MISROUTE_ONSET_MS + 2_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
      ]);
      expect(state.transitions.incidentState).toBe("quality-tiering-standard");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(state.values.cumulativeSilentCriticalDowngradeCount).toBe(0);
      // But the PEAK historical record is real, nonzero, and never reset.
      expect(state.peaks.peakValues.cumulativeSilentCriticalDowngradeCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Honest 'quality protected, cost unaddressed' family", () => {
    it("blanket-large-model protects quality fully but never contains the cost explosion", () => {
      const baselineState = runScenario(SUSTAINED_MISROUTE_MS + 10_000);
      const largeState = runScenario(SUSTAINED_MISROUTE_MS + 10_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-large-model" },
      ]);
      expect(largeState.transitions.incidentState).toBe("blanket-large-model-sustained");
      expect(largeState.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(largeState.values.costStatus).toBe("cost-explosive");
      // Costs even MORE than doing nothing — a real, honest tradeoff,
      // never a free lunch.
      expect(largeState.values.monthlyInferenceCostUsd as number).toBeGreaterThan(
        baselineState.values.monthlyInferenceCostUsd as number,
      );
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, largeState);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Alternate strong path B: explicit quality-tiering policy (immediate)", () => {
    it("quality-tiering protects critical traffic and contains cost immediately, no drain lag required", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 35_000, QUALITY_TIERING_ACTIONS);
      expect(state.transitions.incidentState).toBe("quality-tiering-standard");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(state.values.costStatus).toBe("cost-contained");
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("quality-tiering never touches routingLayerUptimePercent/inferenceP99LatencyMs structurally", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 5_000, QUALITY_TIERING_ACTIONS);
      expect(state.values.routingLayerUptimePercent).toBe(99.97);
    });

    it("enhanced small-model tier scores higher quality than standard, still OPTIMAL (not a dead control)", () => {
      const standardState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, QUALITY_TIERING_ACTIONS);
      const enhancedState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
        ...QUALITY_TIERING_ACTIONS,
        { atMs: SUSTAINED_MISROUTE_MS + 2_000, controlKey: SMALL_MODEL_QUALITY_FLOOR_KEY, value: "enhanced" },
      ]);
      expect(enhancedState.transitions.incidentState).toBe("quality-tiering-enhanced");
      expect(enhancedState.values.averageResponseQualityScore as number).toBeGreaterThan(
        standardState.values.averageResponseQualityScore as number,
      );
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, enhancedState);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("cache reuse reduces cost further under quality-tiering (not a dead control)", () => {
      const withoutCache = runScenario(SUSTAINED_MISROUTE_MS + 5_000, QUALITY_TIERING_ACTIONS);
      const withCache = runScenario(SUSTAINED_MISROUTE_MS + 5_000, [
        ...QUALITY_TIERING_ACTIONS,
        { atMs: SUSTAINED_MISROUTE_MS + 2_000, controlKey: NON_CRITICAL_CACHE_REUSE_KEY, value: "on" },
      ]);
      expect(withCache.transitions.incidentState).toBe("quality-tiering-standard-cache");
      expect(withCache.values.monthlyInferenceCostUsd as number).toBeLessThan(
        withoutCache.values.monthlyInferenceCostUsd as number,
      );
      expect(withCache.values.cacheReuseHitRatePercent as number).toBeGreaterThan(0);
    });
  });

  describe("DEFAULT-VALUE PATH COMPLETENESS: Path B with every extra control left at its untouched default", () => {
    it("REGRESSION: quality-tiering alone, with criticalSegmentPolicy/smallModelQualityFloor/nonCriticalCacheReuse all left at default, reaches a genuinely safe OPTIMAL terminal state at every elapsed window, never falling through to baseline", () => {
      const activeState = runScenario(MISROUTE_ONSET_MS + 40_000, QUALITY_TIERING_ACTIONS.map((a) => ({
        ...a,
        atMs: MISROUTE_ONSET_MS + 1_000,
      })));
      const sustainedState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
      ]);
      for (const state of [activeState, sustainedState]) {
        expect(state.transitions.incidentState).not.toBe("baseline-active-misroute");
        expect(state.transitions.incidentState).not.toBe("baseline-sustained-misroute");
        expect(state.transitions.incidentState).toBe("quality-tiering-standard");
        expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
        expect(state.values.qualityProtectionStatus).toBe("protected");
        expect(state.values.safetyBasis).toBe("deliberate-protection");
        expect(state.values.costStatus).toBe("cost-contained");
        const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
        const finish = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
        expect(finish.outcome).toBe("resolved");
        expect(finish.completionTier).toBe("optimal");
      }
    });
  });

  describe("Alternate strong path A: classifier remediation (root-cause fix)", () => {
    it("dispatching the fix just now (tick-zero proof) does not instantly protect critical traffic — the rollout is not instant", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 3_000, CLASSIFIER_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("classifier-fix-unprotected-just-dispatched");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent as number).toBeGreaterThan(0);
    });

    it("window 1 shows real, partial exposure reduction below the just-dispatched level", () => {
      const justDispatched = runScenario(SUSTAINED_MISROUTE_MS + 3_000, CLASSIFIER_FIX_ACTIONS);
      const window1 = runScenario(CLASSIFIER_FIX_WINDOW_1_MS + 5_000, CLASSIFIER_FIX_ACTIONS);
      expect(window1.transitions.incidentState).toBe("classifier-fix-unprotected-window1");
      expect(window1.values.criticalTrafficSilentlyDowngradedPercent as number).toBeLessThan(
        justDispatched.values.criticalTrafficSilentlyDowngradedPercent as number,
      );
      expect(window1.values.criticalTrafficSilentlyDowngradedPercent as number).toBeGreaterThan(0);
    });

    it("only after the full rollout does the classifier-fix path reach genuine OPTIMAL with zero exposure", () => {
      const state = runScenario(CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS + 35_000, CLASSIFIER_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("classifier-fix-fully-rolled-out");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(state.values.costStatus).toBe("cost-contained");
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("pinning the critical segment as defense-in-depth DURING the rollout eliminates exposure immediately, before the classifier itself has caught up", () => {
      const unprotected = runScenario(SUSTAINED_MISROUTE_MS + 3_000, CLASSIFIER_FIX_ACTIONS);
      const protectedState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
        ...CLASSIFIER_FIX_ACTIONS,
        { atMs: SUSTAINED_MISROUTE_MS + 2_000, controlKey: CRITICAL_SEGMENT_POLICY_KEY, value: "always-large-model" },
      ]);
      expect(protectedState.transitions.incidentState).toBe("classifier-fix-protected-rollout");
      expect(protectedState.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(unprotected.values.criticalTrafficSilentlyDowngradedPercent as number).toBeGreaterThan(0);
      // Still cost-explosive during the rollout — the pin protects
      // quality, it does not itself contain cost.
      expect(protectedState.values.costStatus).toBe("cost-explosive");
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, protectedState);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("DEFAULT-VALUE PATH COMPLETENESS: Path A fully rolled out with criticalSegmentPolicy left at default", () => {
    it("REGRESSION: classifierRemediation=true + routingPolicy left at default 'classifier-only', with criticalSegmentPolicy/smallModelQualityFloor/nonCriticalCacheReuse ALL left at their untouched defaults, reaches genuine OPTIMAL once the rollout fully elapses, never falling through to baseline purely from elapsed time", () => {
      const state = runScenario(CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS + 35_000, CLASSIFIER_FIX_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-misroute");
      expect(state.transitions.incidentState).not.toBe("baseline-active-misroute");
      expect(state.transitions.incidentState).toBe("classifier-fix-fully-rolled-out");
      expect(state.values.criticalTrafficSilentlyDowngradedPercent).toBe(0);
      expect(state.values.qualityProtectionStatus).toBe("protected");
      expect(state.values.safetyBasis).toBe("deliberate-protection");
      expect(state.values.costStatus).toBe("cost-contained");
      expect(state.values.cumulativeSilentCriticalDowngradeCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });
  });

  describe("Legitimate degraded-but-safe state", () => {
    it("blanket-large-model, blanket-small-model-protected, and classifier-fix-protected-rollout all qualify as ACCEPTABLE while cost stays unaddressed", () => {
      const states = [
        runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
          { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-large-model" },
        ]),
        runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
          { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
          { atMs: MISROUTE_ONSET_MS + 2_000, controlKey: CRITICAL_SEGMENT_POLICY_KEY, value: "always-large-model" },
        ]),
        runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
          ...CLASSIFIER_FIX_ACTIONS,
          { atMs: SUSTAINED_MISROUTE_MS + 2_000, controlKey: CRITICAL_SEGMENT_POLICY_KEY, value: "always-large-model" },
        ]),
      ];
      for (const state of states) {
        const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
        expect(state.values.safetyBasis).toBe("deliberate-protection");
      }
    });
  });

  describe("Baseline is never Finish-eligible merely because nothing visible has broken yet", () => {
    it("baseline (classifier-only, nothing dispatched) fails both acceptableCondition and successCondition despite qualityProtectionStatus reading 'protected'", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 30_000);
      expect(state.values.qualityProtectionStatus).toBe("protected");
      expect(state.values.safetyBasis).toBe("unaddressed");
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(MISROUTE_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable, even though serving metrics already read green", () => {
      const state = runScenario(MISROUTE_ONSET_MS + 5_000);
      expect(state.values.routingLayerUptimePercent).toBe(99.97);
      const result = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained misroute still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("candidate_declared mode still reports declared_unstable even though the attempt never auto-failed", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 15 * 60_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      const result = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("engaging every lever simultaneously never degrades routingLayerUptimePercent/inferenceP99LatencyMs/feature-store health", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 5_000, [
        { atMs: SUSTAINED_MISROUTE_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
        { atMs: SUSTAINED_MISROUTE_MS + 2_000, controlKey: SMALL_MODEL_QUALITY_FLOOR_KEY, value: "enhanced" },
        { atMs: SUSTAINED_MISROUTE_MS + 3_000, controlKey: NON_CRITICAL_CACHE_REUSE_KEY, value: "on" },
        { atMs: SUSTAINED_MISROUTE_MS + 4_000, controlKey: CRITICAL_SEGMENT_POLICY_KEY, value: "always-large-model" },
      ]);
      expect(state.values.routingLayerUptimePercent).toBe(99.97);
      expect(state.values.inferenceP99LatencyMs as number).toBeLessThanOrEqual(200);
    });
  });

  describe("Scoring", () => {
    it("optimal path (quality-tiering) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 35_000, QUALITY_TIERING_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      const inputs = extractFinishScoringInputs(mlInferenceCostVsQualityIncidentSimulation, result);
      const score = scoreAuthoredAttempt(ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.costEfficiency).toBe(100);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (quality-tiering) SCORE", JSON.stringify(score));
    });

    it("optimal path (classifier-fix fully rolled out) reaches the same tier via a genuinely different, slower mechanism, with a real score penalty for the exposure incurred en route", () => {
      const state = runScenario(CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS + 35_000, CLASSIFIER_FIX_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(mlInferenceCostVsQualityIncidentSimulation, result);
      const score = scoreAuthoredAttempt(ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (classifier-fix) SCORE", JSON.stringify(score));
    });

    it("acceptable path (blanket-large-model) scores well but below optimal, real cost penalty applied", () => {
      const optimalState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, QUALITY_TIERING_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        extractFinishScoringInputs(mlInferenceCostVsQualityIncidentSimulation, optimalResult),
      );

      const acceptableState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-large-model" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(mlInferenceCostVsQualityIncidentSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        extractFinishScoringInputs(mlInferenceCostVsQualityIncidentSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.breakdown.costEfficiency).toBeLessThan(optimalScore.breakdown.costEfficiency);
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (blanket-large-model) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    // Regression coverage for phase-6e3-scoring-closeout.md: OPTIMAL
    // classifier-fix (fully rolled out) genuinely scores 180 points
    // BELOW ACCEPTABLE blanket-large-model. This is intentional (Option
    // D), and the single most scrutinized divergence in this batch's
    // closeout (matching the rigor the Phase 6E.1 #84 closeout applied).
    //
    // dataIntegrity TIES at 200/200 for both paths — this is expected
    // and correct, not a scoring gap: dataIntegrity here is gated on
    // qualityProtectionStatus, which reads the FINAL matched rule's
    // state (the engine's standard convention, identical to every other
    // built-in scenario's equivalent dimension), and both paths' FINAL
    // state has qualityProtectionStatus="protected". dataIntegrity
    // cannot and does not distinguish "never at risk" from "was at
    // risk, then genuinely fixed" — that distinction is carried by
    // recovery/customerImpact instead, which DO integrate real exposure
    // across the whole attempt, not just the final tick.
    //
    // The entire 180-point gap is recovery (150 vs 300) + customerImpact
    // (120 vs 200) + reliability (130 vs 150), partially offset by
    // costEfficiency (100 vs 30). classifier-fix requires waiting for
    // CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS (a real ~8-minute rollout
    // window) during which the classifier-fix-unprotected-* family is
    // live: criticalTrafficSilentlyDowngradedPercent=32 at
    // "just-dispatched", a REAL safety exposure (critical traffic
    // genuinely served by the wrong model) that accrues real revenue
    // loss and a real, non-resetting cumulativeSilentCriticalDowngrade-
    // Count — this is the actual, named tradeoff: classifier-fix is a
    // durable root-cause repair (monthlyInferenceCostUsd: 3,200,
    // costStatus "cost-contained" forever) bought at the real price of
    // a live exposure window on the way there. blanket-large-model never
    // has ANY exposure window (criticalTrafficSilentlyDowngradedPercent
    // is unconditionally 0 from the first tick) but never contains the
    // cost explosion either (monthlyInferenceCostUsd stays 14,500
    // forever, costStatus "cost-explosive" permanently — confirmed via
    // rules.ts: blanket-large-model-sustained has no elapsed-time
    // escalation path and can NEVER reach OPTIMAL, only ACCEPTABLE,
    // since successCondition requires costStatus="cost-contained").
    // This test exists so a future edit cannot silently change either
    // tier, erase this exact dimension structure, or let
    // blanket-large-model accidentally reach OPTIMAL while its cost
    // explosion remains unaddressed.
    it("REGRESSION: OPTIMAL classifier-fix (fully rolled out) genuinely scores 180 points below ACCEPTABLE blanket-large-model, for named, legitimate reasons — tier/score divergence is intentional (Option D), and blanket-large-model can never escalate to OPTIMAL while its cost explosion remains unaddressed", () => {
      const classifierFixState = runScenario(CLASSIFIER_FIX_FULLY_ROLLED_OUT_MS + 35_000, CLASSIFIER_FIX_ACTIONS);
      const classifierFixResult = evaluateCandidateDeclaredFinish(
        mlInferenceCostVsQualityIncidentSimulation,
        classifierFixState,
      );
      const classifierFixScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        extractFinishScoringInputs(mlInferenceCostVsQualityIncidentSimulation, classifierFixResult),
      );

      const blanketLargeState = runScenario(SUSTAINED_MISROUTE_MS + 35_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-large-model" },
      ]);
      const blanketLargeResult = evaluateCandidateDeclaredFinish(
        mlInferenceCostVsQualityIncidentSimulation,
        blanketLargeState,
      );
      const blanketLargeScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        extractFinishScoringInputs(mlInferenceCostVsQualityIncidentSimulation, blanketLargeResult),
      );

      // Tiers: both real, correctly classified.
      expect(classifierFixResult.completionTier).toBe("optimal");
      expect(blanketLargeResult.completionTier).toBe("acceptable");

      // The divergence is real, reproducible, and exactly 180 points.
      expect(classifierFixScore.total).toBeLessThan(blanketLargeScore.total);
      expect(classifierFixScore.total).toBe(750);
      expect(blanketLargeScore.total).toBe(930);
      expect(blanketLargeScore.total - classifierFixScore.total).toBe(180);

      // dataIntegrity ties — expected, not a gap (both final states are
      // qualityProtectionStatus="protected").
      expect(classifierFixScore.breakdown.dataIntegrity).toBe(blanketLargeScore.breakdown.dataIntegrity);
      expect(classifierFixScore.breakdown.dataIntegrity).toBe(200);

      // The gap is driven by recovery + customerImpact + reliability
      // (the real exposure window), partially offset by costEfficiency
      // (the real, durable cost-containment win).
      expect(classifierFixScore.breakdown.recovery).toBeLessThan(blanketLargeScore.breakdown.recovery);
      expect(classifierFixScore.breakdown.customerImpact).toBeLessThan(blanketLargeScore.breakdown.customerImpact);
      expect(classifierFixScore.breakdown.reliability).toBeLessThanOrEqual(blanketLargeScore.breakdown.reliability);
      expect(classifierFixScore.breakdown.costEfficiency).toBeGreaterThan(blanketLargeScore.breakdown.costEfficiency);

      // blanket-large-model must never be able to reach OPTIMAL while
      // its cost explosion remains unaddressed, however long it runs.
      const sustainedBlanketLarge = runScenario(SUSTAINED_MISROUTE_MS + 20 * 60_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-large-model" },
      ]);
      const sustainedResult = evaluateCandidateDeclaredFinish(
        mlInferenceCostVsQualityIncidentSimulation,
        sustainedBlanketLarge,
      );
      expect(sustainedResult.completionTier).not.toBe("optimal");
      expect(sustainedBlanketLarge.values.costStatus).toBe("cost-explosive");

      console.log(
        "CLASSIFIER-FIX vs BLANKET-LARGE-MODEL (closeout regression, 180-point gap)",
        JSON.stringify({ classifierFixScore, blanketLargeScore }),
      );
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (blanket-small-model, unprotected) scores worse than baseline on dataIntegrity AND total, despite serving metrics looking just as good and cost looking cheapest", () => {
      const baselineState = runScenario(SUSTAINED_MISROUTE_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_MISROUTE_MS + 60_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.routingLayerUptimePercent).toBe(baselineState.values.routingLayerUptimePercent);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (blanket-small-model) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("unsafe-minimum-cost (blanket-small-model, cheapest inference spend) cannot win overall against the safe-but-costlier quality-tiering path", () => {
      const unsafeMinCostState = runScenario(SUSTAINED_MISROUTE_MS + 60_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      const safeState = runScenario(SUSTAINED_MISROUTE_MS + 60_000, QUALITY_TIERING_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        buildScoringInputs(unsafeMinCostState),
      );
      const safeScore = scoreAuthoredAttempt(
        ML_INFERENCE_COST_VS_QUALITY_INCIDENT_SCORING,
        buildScoringInputs(safeState),
      );
      // The unsafe path spends far LESS on raw inference cost...
      expect(unsafeMinCostState.values.monthlyInferenceCostUsd as number).toBeLessThan(
        safeState.values.monthlyInferenceCostUsd as number,
      );
      // ...yet still cannot win on total score.
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE MINIMUM-COST SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE-BUT-COSTLIER SCORE (for comparison)", JSON.stringify(safeScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(SUSTAINED_MISROUTE_MS + 5_000, QUALITY_TIERING_ACTIONS);
      const runB = runScenario(SUSTAINED_MISROUTE_MS + 5_000, QUALITY_TIERING_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak silent-downgrade rate and cumulative count generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 10_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "blanket-small-model" },
      ]);
      expect(state.peaks.peakValues.criticalTrafficSilentlyDowngradedPercent).toBeGreaterThan(0);
      expect(state.peaks.peakValues.cumulativeSilentCriticalDowngradeCount).toBeGreaterThan(0);
    });

    it("tracks peak monthly inference cost even after the candidate later reduces it (non-resetting)", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 20_000, [
        { atMs: SUSTAINED_MISROUTE_MS + 1_000, controlKey: ROUTING_POLICY_KEY, value: "quality-tiering" },
      ]);
      expect(state.peaks.peakValues.monthlyInferenceCostUsd).toBeGreaterThanOrEqual(12_600);
      expect(state.values.monthlyInferenceCostUsd as number).toBeLessThan(
        state.peaks.peakValues.monthlyInferenceCostUsd as number,
      );
    });
  });

  describe("No accidental automatic success or optimal state through random control mashing", () => {
    it("setting every control to a plausible-but-wrong combination never reaches a safe tier by accident", () => {
      const state = runScenario(SUSTAINED_MISROUTE_MS + 5_000, [
        { atMs: MISROUTE_ONSET_MS + 1_000, controlKey: SMALL_MODEL_QUALITY_FLOOR_KEY, value: "enhanced" },
        { atMs: MISROUTE_ONSET_MS + 2_000, controlKey: NON_CRITICAL_CACHE_REUSE_KEY, value: "on" },
        { atMs: MISROUTE_ONSET_MS + 3_000, controlKey: CLASSIFIER_REMEDIATION_KEY, value: false },
      ]);
      // routingPolicy/criticalSegmentPolicy both left at default —
      // still the unaddressed baseline, regardless of the other two
      // genuinely-safe-elsewhere levers being touched.
      expect(state.transitions.incidentState).toBe("baseline-sustained-misroute");
      const eligibility = evaluateCompletionEligibility(mlInferenceCostVsQualityIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });
});
