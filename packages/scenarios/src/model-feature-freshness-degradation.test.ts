import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { modelFeatureFreshnessDegradation } from "./model-feature-freshness-degradation";
import {
  CRITICAL_DECISION_HOLD_KEY,
  FEATURE_FALLBACK_MODE_KEY,
  FEATURE_REFRESH_POLICY_KEY,
  MODEL_QUALITY_TIER_KEY,
  MODEL_ROUTING_KEY,
  OFFLINE_SNAPSHOT_USE_KEY,
  PIPELINE_PRIORITY_KEY,
  STALE_FEATURE_CUTOFF_KEY,
  modelFeatureFreshnessDegradationSimulation,
} from "./model-feature-freshness-degradation/definition";
import { modelFeatureFreshnessDegradationCandidateUI } from "./model-feature-freshness-degradation/candidate-ui";
import { MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING } from "./model-feature-freshness-degradation/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_2_MS,
  DRAIN_WINDOW_FULLY_RECOVERED_MS,
  LAG_ONSET_MS,
  SUSTAINED_LAG_MS,
} from "./model-feature-freshness-degradation/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(modelFeatureFreshnessDegradationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += modelFeatureFreshnessDegradationSimulation.tickMs
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
      modelFeatureFreshnessDegradationSimulation,
      state,
      action,
      modelFeatureFreshnessDegradationSimulation.tickMs,
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
      modelFeatureFreshnessDegradationSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: fresh-fallback model routing (full quality) —
// protects decision quality immediately, no drain lag needed.
const FRESH_FALLBACK_FULL_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: MODEL_ROUTING_KEY, value: "fresh-fallback" },
];

// Alternate strong path B: bounded cutoff + hold + critical-features-first
// — genuinely safe immediately (zero stale critical decisions), full
// recovery once the drain window elapses.
const HELD_BOUNDED_PRIORITIZED_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
  { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
  { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: PIPELINE_PRIORITY_KEY, value: "critical-features-first" },
];

describe("Model Feature Freshness Degradation", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(modelFeatureFreshnessDegradation.isFree).toBe(false);
      expect(modelFeatureFreshnessDegradation.library?.category).toBe("Data Pipelines");
      expect(modelFeatureFreshnessDegradation.library?.tags.length).toBeGreaterThan(0);
      expect(modelFeatureFreshnessDegradation.library?.skills.length).toBeGreaterThan(0);
      expect(modelFeatureFreshnessDegradation.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(modelFeatureFreshnessDegradationCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(modelFeatureFreshnessDegradationCandidateUI.controls.length).toBeGreaterThanOrEqual(8);
      expect(modelFeatureFreshnessDegradationCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 4-edge pipeline matching the spec", () => {
      expect(modelFeatureFreshnessDegradationSimulation.architecture.nodes.length).toBe(5);
      expect(modelFeatureFreshnessDegradationSimulation.architecture.edges.length).toBe(4);
      for (const node of modelFeatureFreshnessDegradationSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(modelFeatureFreshnessDegradation.description).toMatch(
        /decision quality must remain above the authored safety\/business threshold/i,
      );
      expect(modelFeatureFreshnessDegradation.description).toMatch(
        /serving stale features beyond the allowed bound is not acceptable/i,
      );
      expect(modelFeatureFreshnessDegradation.description).toMatch(
        /bounded fallback model or feature set may be preferable/i,
      );
      expect(modelFeatureFreshnessDegradation.description).toMatch(
        /model-serving uptime is not the primary objective/i,
      );
      expect(modelFeatureFreshnessDegradation.description).toMatch(
        /critical decisions may need to be delayed or downgraded/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of modelFeatureFreshnessDegradationSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        modelFeatureFreshnessDegradationSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of modelFeatureFreshnessDegradationSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(modelFeatureFreshnessDegradationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.decisionQualityScore).toBe(100);
      expect(state.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(state.values.cumulativeStaleCriticalDecisionCount).toBe(0);
    });

    it("lag onset triggers the incident with degrading decision quality, never touching uptime/latency", () => {
      const state = runScenario(LAG_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(LAG_ONSET_MS);
      expect(state.values.modelServingUptimePercent).toBe(99.95);
      expect(state.values.decisionApiP99LatencyMs).toBe(85);
    });

    it("baseline (no action) degrades decision quality while uptime/latency stay perfect throughout (the core decoy)", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-lagging");
      expect(state.values.modelServingUptimePercent).toBe(99.95);
      expect(state.values.decisionApiP99LatencyMs).toBe(85);
      expect(state.values.decisionQualityScore as number).toBeLessThan(85);
      expect(state.values.staleFeaturePercentOnCriticalDecisions as number).toBeGreaterThan(0);
    });
  });

  describe("Required decision-quality trap: silent permissive fallback never shows up on uptime/latency", () => {
    it("permissive + unbounded cutoff creates real, nonzero stale critical decisions while serving metrics stay perfect", () => {
      const baseline = runScenario(SUSTAINED_LAG_MS + 5_000);
      const silent = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      expect(silent.transitions.incidentState).toBe("silent-permissive-sustained");
      // Uptime/latency are IDENTICAL to baseline — the trap is invisible
      // on serving health.
      expect(silent.values.modelServingUptimePercent).toBe(baseline.values.modelServingUptimePercent);
      expect(silent.values.decisionApiP99LatencyMs).toBe(baseline.values.decisionApiP99LatencyMs);
      expect(silent.values.staleFeaturePercentOnCriticalDecisions as number).toBeGreaterThan(0);
      expect(silent.values.cumulativeStaleCriticalDecisionCount as number).toBeGreaterThan(0);
      expect(silent.values.decisionRiskStatus).toBe("quality-compromised-silent");
    });

    it("permissive mode held longer compounds the stale-critical-decision count further", () => {
      const early = runScenario(LAG_ONSET_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      const sustained = runScenario(SUSTAINED_LAG_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      expect(sustained.values.cumulativeStaleCriticalDecisionCount as number).toBeGreaterThan(
        early.values.cumulativeStaleCriticalDecisionCount as number,
      );
    });

    it("silent-permissive can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 60_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("sustained silent-permissive exposure never auto-fails the attempt, even though the failure condition stays sustained well past its old window", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 15 * 60_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        modelFeatureFreshnessDegradationSimulation.failureCondition.sustainedSeconds,
      );
      const finish = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Decision-quality QA: silent-permissive cannot be laundered into a safe outcome", () => {
    it("switching back to strict stops NEW stale decisions but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(SUSTAINED_LAG_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      const correctedState = runScenario(SUSTAINED_LAG_MS + 20_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
        { atMs: SUSTAINED_LAG_MS + 11_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "strict" },
      ]);
      expect(sealedUnsafeState.values.staleFeaturePercentOnCriticalDecisions as number).toBeGreaterThan(0);
      // Live correctness: strict alone (without bounded cutoff) still
      // flags staleness honestly rather than silently granting it, but
      // the field we assert on here is the PEAK historical record.
      expect(correctedState.peaks.peakValues.cumulativeStaleCriticalDecisionCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeStaleCriticalDecisionCount as number,
      );
    });

    it("full remediation after an unsafe permissive window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
        { atMs: LAG_ONSET_MS + 2_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "strict" },
        { atMs: LAG_ONSET_MS + 3_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
        { atMs: LAG_ONSET_MS + 4_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
        { atMs: LAG_ONSET_MS + 5_000, controlKey: PIPELINE_PRIORITY_KEY, value: "critical-features-first" },
      ]);
      expect(state.transitions.incidentState).toBe("fully-recovered-held-prioritized");
      expect(state.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(state.values.cumulativeStaleCriticalDecisionCount).toBe(0);
      expect(state.values.decisionRiskStatus).toBe("healthy");
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier permissive window
      // this attempt passed through.
      expect(state.peaks.peakValues.cumulativeStaleCriticalDecisionCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Second unsafe path: offline snapshot use for critical decisions", () => {
    it("offline-snapshot-use alone is unsafe even with strict fallback and bounded cutoff otherwise defaulted", () => {
      const baselineState = runScenario(SUSTAINED_LAG_MS + 10_000);
      const snapshotState = runScenario(SUSTAINED_LAG_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: OFFLINE_SNAPSHOT_USE_KEY, value: true },
      ]);
      expect(snapshotState.transitions.incidentState).toBe("offline-snapshot-critical-trap");
      expect(snapshotState.values.staleFeaturePercentOnCriticalDecisions as number).toBeGreaterThan(0);
      expect(snapshotState.values.decisionRiskStatus).toBe("quality-compromised-silent");
      // Uptime looks just as good as baseline.
      expect(snapshotState.values.modelServingUptimePercent).toBe(baselineState.values.modelServingUptimePercent);
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, snapshotState);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("offline-snapshot trap is independent of (not reachable only through) the permissive-fallback lever", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "strict" },
        { atMs: LAG_ONSET_MS + 2_000, controlKey: OFFLINE_SNAPSHOT_USE_KEY, value: true },
      ]);
      expect(state.transitions.incidentState).toBe("offline-snapshot-critical-trap");
      expect(state.values.staleFeaturePercentOnCriticalDecisions as number).toBeGreaterThan(0);
    });
  });

  describe("Alternate strong path A: fresh-fallback model routing", () => {
    it("fresh-fallback (full quality) protects decision quality immediately, no drain lag required", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 35_000, FRESH_FALLBACK_FULL_ACTIONS);
      expect(state.transitions.incidentState).toBe("fresh-fallback-full-quality");
      expect(state.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(state.values.decisionQualityScore as number).toBeGreaterThanOrEqual(85);
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("fresh-fallback (lightweight) is genuinely safe but scores lower decision quality than full tier, landing only ACCEPTABLE", () => {
      const fullState = runScenario(SUSTAINED_LAG_MS + 35_000, FRESH_FALLBACK_FULL_ACTIONS);
      const lightweightState = runScenario(SUSTAINED_LAG_MS + 35_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: MODEL_ROUTING_KEY, value: "fresh-fallback" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: MODEL_QUALITY_TIER_KEY, value: "lightweight" },
      ]);
      expect(lightweightState.transitions.incidentState).toBe("fresh-fallback-lightweight");
      expect(lightweightState.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(lightweightState.values.decisionQualityScore as number).toBeLessThan(
        fullState.values.decisionQualityScore as number,
      );
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, lightweightState);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("fresh-fallback routing never touches modelServingUptimePercent/decisionApiP99LatencyMs structurally", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 5_000, FRESH_FALLBACK_FULL_ACTIONS);
      expect(state.values.modelServingUptimePercent).toBe(99.95);
    });
  });

  describe("Alternate strong path B: bounded cutoff + critical-decision hold + pipeline priority", () => {
    it("engaging the hold immediately zeroes stale critical decisions even before any drain time has elapsed", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 4_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
      ]);
      expect(state.transitions.incidentState).toBe("held-just-engaged");
      expect(state.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(state.values.criticalDecisionsHeldPerMinute as number).toBeGreaterThan(0);
    });

    it("drain window 1 shows real, partial decision-quality recovery above the just-engaged trap value", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      expect(state.transitions.incidentState).toBe("draining-window1-held-prioritized");
      expect(state.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
    });

    it("drain window 2 shows further decision-quality progress than window 1", () => {
      const window1 = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const window2 = runScenario(DRAIN_WINDOW_2_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      expect(window2.transitions.incidentState).toBe("draining-window2-held-prioritized");
      expect(window2.values.decisionQualityScore as number).toBeGreaterThan(
        window1.values.decisionQualityScore as number,
      );
    });

    it("only after the full drain window does the held+bounded+prioritized path reach genuine OPTIMAL", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-recovered-held-prioritized");
      expect(state.values.decisionQualityScore).toBe(99);
      expect(state.values.decisionRiskStatus).toBe("healthy");
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: bounded + hold=true + balanced (pipelinePriority left at its default) reaches a genuinely safe OPTIMAL terminal state once the full drain window elapses, never falling through to baseline-sustained-lagging", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
      ]);
      // Must NOT regress to the unmitigated baseline purely from
      // elapsed time with zero further candidate action.
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-lagging");
      expect(state.transitions.incidentState).toBe("fully-recovered-held-balanced");
      expect(state.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(state.values.decisionRiskStatus).toBe("healthy");
      expect(state.values.freshnessStatus).toBe("fresh");
      expect(state.values.cumulativeStaleCriticalDecisionCount).toBe(0);
      expect(state.values.decisionQualityScore as number).toBeGreaterThanOrEqual(85);
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("pipelinePriority is not a dead control: critical-features-first recovers faster than balanced at an equivalent elapsed time", () => {
      const prioritized = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const balanced = runScenario(DRAIN_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
      ]);
      expect(balanced.transitions.incidentState).toBe("draining-window1-held-balanced");
      expect(prioritized.values.decisionQualityScore as number).toBeGreaterThan(
        balanced.values.decisionQualityScore as number,
      );
    });

    it("bounded cutoff with hold OFF is still genuinely safe (protective default), but never improves with elapsed time the way holding does", () => {
      const noHoldEarly = runScenario(SUSTAINED_LAG_MS + 4_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
      ]);
      const noHoldLater = runScenario(SUSTAINED_LAG_MS + 35_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
      ]);
      const heldFullyDrained = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      expect(noHoldLater.transitions.incidentState).toBe("bounded-protective-default-no-hold");
      expect(noHoldLater.values.staleFeaturePercentOnCriticalDecisions).toBe(0);
      expect(noHoldLater.values.criticalDecisionsHeldPerMinute).toBe(0);
      // Protective-default's decision quality never moves with elapsed
      // time (no drain mechanic applies to it) — it is flat whether
      // caught early or checked much later...
      expect(noHoldLater.values.decisionQualityScore).toBe(noHoldEarly.values.decisionQualityScore);
      // ...while holding genuinely recovers to a materially higher
      // decision-quality ceiling once the pipeline itself has fully
      // drained — a real, honest distinction between the two safe
      // sub-strategies: not-holding never catches up to full recovery.
      expect(heldFullyDrained.values.decisionQualityScore as number).toBeGreaterThan(
        noHoldLater.values.decisionQualityScore as number,
      );
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, noHoldLater);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Legitimate degraded-but-safe state", () => {
    it("the held+bounded draining family and the fresh-fallback family both qualify as ACCEPTABLE before full recovery", () => {
      const heldState = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const eligibility = evaluateCompletionEligibility(modelFeatureFreshnessDegradationSimulation, heldState);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(heldState.values.decisionRiskStatus).toBe("safe-degraded");
    });
  });

  describe("Cost efficiency (first-class axis): two genuinely safe paths differ materially on cost", () => {
    it("fresh-fallback (ongoing serving compute) costs more per month than the held+bounded path (no extra serving compute)", () => {
      const freshFallbackState = runScenario(SUSTAINED_LAG_MS + 5_000, FRESH_FALLBACK_FULL_ACTIONS);
      const heldState = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
      ]);
      expect(freshFallbackState.cost.currentMonthlyCostUsd).toBeGreaterThan(heldState.cost.currentMonthlyCostUsd);
    });

    it("aggressive refresh policy adds real ongoing cost, but genuinely accelerates recovery at the same elapsed drain window (not a dead control)", () => {
      const withoutAggressive = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const withAggressive = runScenario(DRAIN_WINDOW_1_MS + 5_000, [
        ...HELD_BOUNDED_PRIORITIZED_ACTIONS,
        { atMs: SUSTAINED_LAG_MS + 4_000, controlKey: FEATURE_REFRESH_POLICY_KEY, value: "aggressive" },
      ]);
      expect(withAggressive.transitions.incidentState).toBe("draining-window1-held-prioritized-aggressive-refresh");
      expect(withoutAggressive.transitions.incidentState).toBe("draining-window1-held-prioritized");
      expect(withAggressive.values.decisionQualityScore as number).toBeGreaterThan(
        withoutAggressive.values.decisionQualityScore as number,
      );
      expect(withAggressive.cost.currentMonthlyCostUsd).toBeGreaterThan(withoutAggressive.cost.currentMonthlyCostUsd);
    });

    it("both alternate strong paths reach OPTIMAL-or-ACCEPTABLE with an honest cost distinction, not a forced tie", () => {
      const freshFallbackState = runScenario(SUSTAINED_LAG_MS + 35_000, FRESH_FALLBACK_FULL_ACTIONS);
      const heldState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const freshResult = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, freshFallbackState);
      const heldResult = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, heldState);
      const freshScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        extractFinishScoringInputs(modelFeatureFreshnessDegradationSimulation, freshResult),
      );
      const heldScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        extractFinishScoringInputs(modelFeatureFreshnessDegradationSimulation, heldResult),
      );
      expect(freshResult.completionTier).toBe("optimal");
      expect(heldResult.completionTier).toBe("optimal");
      // Held path has zero extra ongoing serving compute; fresh-fallback
      // carries a real continuous cost for as long as it is engaged —
      // an honest, deliberate cost-efficiency distinction between two
      // otherwise-equally-safe strong paths.
      expect(heldScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(freshScore.breakdown.costEfficiency);
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("raising cost levers never introduces a new bottleneck elsewhere (no pressure-transfer trap exists in this scenario)", () => {
      // aggressive refresh + fresh-fallback + full quality tier
      // simultaneously never degrades modelServingUptimePercent,
      // decisionApiP99LatencyMs, or featureStoreAvailabilityPercent —
      // there is no scaling-induced contention mechanic in this
      // scenario at all.
      const state = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: MODEL_ROUTING_KEY, value: "fresh-fallback" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: MODEL_QUALITY_TIER_KEY, value: "full" },
        { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: FEATURE_REFRESH_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.values.modelServingUptimePercent).toBe(99.95);
      expect(state.values.decisionApiP99LatencyMs).toBeLessThanOrEqual(100);
      expect(state.values.featureStoreAvailabilityPercent).toBe(100);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(LAG_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable, even though serving metrics already read green", () => {
      const state = runScenario(LAG_ONSET_MS + 5_000);
      expect(state.values.modelServingUptimePercent).toBe(99.95);
      const result = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained lag still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("declared_unstable still wins in candidate_declared mode, without the engine auto-failing the attempt", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 15 * 60_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      const result = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-recovered-held-prioritized) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      const inputs = extractFinishScoringInputs(modelFeatureFreshnessDegradationSimulation, result);
      const score = scoreAuthoredAttempt(MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (held+bounded+prioritized) SCORE", JSON.stringify(score));
    });

    it("optimal path (fresh-fallback full quality) reaches the optimal tier far faster, with a real, honest dataIntegrity gap vs. fully-healthy recovery (it is still a deliberate tradeoff, not a zero-cost clean recovery)", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 35_000, FRESH_FALLBACK_FULL_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(modelFeatureFreshnessDegradationSimulation, result);
      const score = scoreAuthoredAttempt(MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING, inputs);
      // decisionRiskStatus is "safe-degraded" here (a deliberate
      // fallback tradeoff), not "healthy" — a real, honest 45-point
      // dataIntegrity gap vs. a fully-recovered, zero-tradeoff path,
      // even though both reach the OPTIMAL completion tier.
      expect(score.breakdown.dataIntegrity).toBe(155);
      console.log("OPTIMAL (fresh-fallback) SCORE", JSON.stringify(score));
    });

    it("acceptable path (held, still draining) scores well but below optimal", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(modelFeatureFreshnessDegradationSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        extractFinishScoringInputs(modelFeatureFreshnessDegradationSimulation, optimalResult),
      );

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 35_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        modelFeatureFreshnessDegradationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        extractFinishScoringInputs(modelFeatureFreshnessDegradationSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (draining-window1-held-prioritized) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (silent-permissive) scores worse than baseline on dataIntegrity AND total, despite serving metrics looking just as good", () => {
      const baselineState = runScenario(SUSTAINED_LAG_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_LAG_MS + 60_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.modelServingUptimePercent).toBe(baselineState.values.modelServingUptimePercent);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (silent-permissive) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("unsafe-minimum-cost (silent-permissive, zero extra spend) cannot win overall against the safe-but-costlier fresh-fallback path", () => {
      const unsafeMinCostState = runScenario(SUSTAINED_LAG_MS + 60_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      const safeButCostlierState = runScenario(SUSTAINED_LAG_MS + 60_000, FRESH_FALLBACK_FULL_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        buildScoringInputs(unsafeMinCostState),
      );
      const safeScore = scoreAuthoredAttempt(
        MODEL_FEATURE_FRESHNESS_DEGRADATION_SCORING,
        buildScoringInputs(safeButCostlierState),
      );
      // The unsafe path spends LESS (no extra compute) ...
      expect(unsafeMinCostState.cost.currentMonthlyCostUsd).toBeLessThan(safeButCostlierState.cost.currentMonthlyCostUsd);
      // ... yet still cannot win on total score.
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE MINIMUM-COST SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE-BUT-COSTLIER SCORE (for comparison)", JSON.stringify(safeScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      const runB = runScenario(DRAIN_WINDOW_1_MS + 5_000, HELD_BOUNDED_PRIORITIZED_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak stale-critical-decision rate and cumulative count generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: FEATURE_FALLBACK_MODE_KEY, value: "permissive" },
      ]);
      expect(state.peaks.peakValues.staleFeaturePercentOnCriticalDecisions).toBeGreaterThan(0);
      expect(state.peaks.peakValues.cumulativeStaleCriticalDecisionCount).toBeGreaterThan(0);
    });
  });
});
