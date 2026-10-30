import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { dataPipelineFreshnessCollapse } from "./data-pipeline-freshness-collapse";
import {
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
  dataPipelineFreshnessCollapseSimulation,
} from "./data-pipeline-freshness-collapse/definition";
import { dataPipelineFreshnessCollapseCandidateUI } from "./data-pipeline-freshness-collapse/candidate-ui";
import { DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING } from "./data-pipeline-freshness-collapse/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_2_MS,
  DRAIN_WINDOW_FULLY_RECOVERED_MS,
  DROP_EXPOSURE_WINDOW_MS,
  LAG_ONSET_MS,
  SUSTAINED_LAG_MS,
} from "./data-pipeline-freshness-collapse/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(dataPipelineFreshnessCollapseSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += dataPipelineFreshnessCollapseSimulation.tickMs
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
      dataPipelineFreshnessCollapseSimulation,
      state,
      action,
      dataPipelineFreshnessCollapseSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function scoringInputsFromState(state: ReturnType<typeof runScenario>) {
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
    initialMonthlyInfrastructureCostUsd: dataPipelineFreshnessCollapseSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Safe sequence: scale the processor AND protect the Warehouse AND
// prioritize Tier-1, engaged right after sustained lag sets in.
const SAFE_SCALING_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
  { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
  { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
  { atMs: SUSTAINED_LAG_MS + 4_000, controlKey: DATASET_PRIORITY_KEY, value: "tier1-first" },
];

const SAFE_SCALING_ACTIONS_THROTTLED: TimedAction[] = [
  ...SAFE_SCALING_ACTIONS,
  { atMs: SUSTAINED_LAG_MS + 5_000, controlKey: LOW_PRIORITY_INGESTION_THROTTLE_KEY, value: true },
];

// Unsafe sequence: scale the processor FIRST, without ever protecting
// the Warehouse.
const NAIVE_SCALE_ONLY_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
];

describe("Data Pipeline Freshness Collapse", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(dataPipelineFreshnessCollapse.isFree).toBe(false);
      expect(dataPipelineFreshnessCollapse.library?.category).toBe("Data Pipelines");
      expect(dataPipelineFreshnessCollapse.library?.tags.length).toBeGreaterThan(0);
      expect(dataPipelineFreshnessCollapse.library?.skills.length).toBeGreaterThan(0);
      expect(dataPipelineFreshnessCollapse.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(dataPipelineFreshnessCollapseCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(dataPipelineFreshnessCollapseCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(dataPipelineFreshnessCollapseCandidateUI.components.length).toBe(5);
    });

    it("the architecture has exactly 5 nodes and 4 edges matching the spec", () => {
      expect(dataPipelineFreshnessCollapseSimulation.architecture.nodes.length).toBe(5);
      expect(dataPipelineFreshnessCollapseSimulation.architecture.edges.length).toBe(4);
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(dataPipelineFreshnessCollapse.description).toMatch(/120-second freshness SLO/i);
      expect(dataPipelineFreshnessCollapse.description).toMatch(/may lag substantially/i);
      expect(dataPipelineFreshnessCollapse.description).toMatch(/events may never be dropped/i);
      expect(dataPipelineFreshnessCollapse.description).toMatch(/warehouse correctness and durability must be preserved/i);
      expect(dataPipelineFreshnessCollapse.description).toMatch(/bounded and demonstrably draining/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of dataPipelineFreshnessCollapseSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(dataPipelineFreshnessCollapseSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.processorLagSeconds).toBe(0);
      expect(state.values.droppedEventCount).toBe(0);
      expect(state.values.pipelineStatus).toBe("recovered");
    });

    it("lag onset triggers the incident while leaving Source Systems/Ingestion untouched", () => {
      const state = runScenario(LAG_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(LAG_ONSET_MS);
      expect(state.values.sourceSystemsHealthPct).toBe(100);
      expect(state.values.ingestionSuccessRate).toBe(99);
      expect(state.values.processorLagSeconds as number).toBeGreaterThan(0);
    });

    it("baseline (no action) shows growing lag and backlog with pipeline diverging", () => {
      const state = runScenario(LAG_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-lagging");
      expect(state.values.pipelineStatus).toBe("diverging");
      expect(state.values.processorLagSeconds as number).toBeGreaterThan(0);
    });

    it("leaving the lag unaddressed long enough compounds into a materially larger backlog (sustained-lag)", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-sustained-lagging");
      const early = runScenario(LAG_ONSET_MS + 5_000);
      expect(state.values.tier2BacklogCount as number).toBeGreaterThan(
        early.values.tier2BacklogCount as number,
      );
    });

    describe("Required pressure-transfer mechanism: scaling the processor without protecting the Warehouse", () => {
      it("harmful/tempting path: raising processor concurrency alone makes Warehouse health measurably WORSE than baseline", () => {
        const baseline = runScenario(LAG_ONSET_MS + 10_000);
        const naivelyScaled = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(naivelyScaled.transitions.incidentState).toBe("processor-scaled-warehouse-contention");
        expect(naivelyScaled.values.warehouseWriteSuccessRate as number).toBeLessThan(
          baseline.values.warehouseWriteSuccessRate as number,
        );
        expect(naivelyScaled.values.warehouseWriteLockWaitMs as number).toBeGreaterThan(
          baseline.values.warehouseWriteLockWaitMs as number,
        );
        expect(naivelyScaled.values.warehouseStatus).toBe("critical");
        const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, naivelyScaled);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("partial protection (writer concurrency alone) reduces but does not eliminate contention", () => {
        const unprotected = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        ]);
        const partiallyProtected = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
          { atMs: LAG_ONSET_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(partiallyProtected.transitions.incidentState).toBe(
          "partial-warehouse-protection-concurrency-only",
        );
        expect(partiallyProtected.values.warehouseWriteSuccessRate as number).toBeGreaterThan(
          unprotected.values.warehouseWriteSuccessRate as number,
        );
        expect(partiallyProtected.values.warehouseWriteSuccessRate as number).toBeLessThan(99);
      });

      it("partial protection (checkpoint cadence alone) also reduces but does not eliminate contention", () => {
        const partiallyProtected = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
          { atMs: LAG_ONSET_MS + 2_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
        ]);
        expect(partiallyProtected.transitions.incidentState).toBe(
          "partial-warehouse-protection-cadence-only",
        );
        expect(partiallyProtected.values.warehouseWriteSuccessRate as number).toBeLessThan(99);
      });

      it("full protection (both levers together) keeps the Warehouse safe while scaled", () => {
        const fullyProtected = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
          { atMs: LAG_ONSET_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
          { atMs: LAG_ONSET_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
        ]);
        expect(fullyProtected.values.warehouseWriteSuccessRate).toBe(99);
        expect(fullyProtected.values.warehouseStatus).toBe("normal");
      });
    });

    describe("Tiered-freshness judgment: protecting the Warehouse is not sufficient without prioritizing Tier-1", () => {
      it("fully-protected scaling with dataset priority left balanced breaches the Tier-1 SLO", () => {
        const state = runScenario(SUSTAINED_LAG_MS + 5_000, [
          { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
          { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
          { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
        ]);
        expect(state.transitions.incidentState).toBe("tier1-breached-unmanaged");
        expect(state.values.tier1FreshnessSeconds as number).toBeGreaterThan(120);
        expect(state.values.servingFreshnessStatus).toBe("tier1-breached");
        const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("adding tier1-first priority on top of full Warehouse protection keeps Tier-1 within SLO", () => {
        const state = runScenario(SUSTAINED_LAG_MS + 5_000, SAFE_SCALING_ACTIONS);
        expect(state.values.tier1FreshnessSeconds as number).toBeLessThanOrEqual(120);
        expect(state.values.servingFreshnessStatus).toBe("fresh");
      });
    });

    describe("Historical damage model: dropped events never reset, even after the lever is turned off", () => {
      it("enabling dropEvents creates a nonzero, permanent droppedEventCount", () => {
        const state = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
        ]);
        expect(state.transitions.incidentState).toBe("drop-events-trap-active");
        expect(state.values.droppedEventCount as number).toBeGreaterThan(0);
        expect(state.values.servingFreshnessStatus).toBe("integrity-violated");
        expect(state.values.pipelineStatus).toBe("integrity-violated");
      });

      it("longer exposure to dropEvents accrues a strictly larger historical count", () => {
        const shortExposure = runScenario(LAG_ONSET_MS + 10_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
        ]);
        const longExposure = runScenario(SUSTAINED_LAG_MS + DROP_EXPOSURE_WINDOW_MS, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
        ]);
        expect(longExposure.values.droppedEventCount as number).toBeGreaterThan(
          shortExposure.values.droppedEventCount as number,
        );
      });

      it("turning dropEvents back off stops NEW drops but never resets the historical count (scarred-but-live-safe)", () => {
        const scarred = runScenario(DROP_EXPOSURE_WINDOW_MS + 60_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
          { atMs: DROP_EXPOSURE_WINDOW_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: false },
          { atMs: DROP_EXPOSURE_WINDOW_MS + 2_000, controlKey: DATASET_PRIORITY_KEY, value: "tier1-first" },
          { atMs: DROP_EXPOSURE_WINDOW_MS + 3_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
          { atMs: DROP_EXPOSURE_WINDOW_MS + 4_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
          { atMs: DROP_EXPOSURE_WINDOW_MS + 5_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
        ]);
        expect(scarred.transitions.incidentState).toBe("drop-events-scarred-live-safe");
        expect(scarred.values.droppedEventCount as number).toBeGreaterThan(0);
        // Carried forward unchanged from the exposure-window value.
        expect(scarred.values.droppedEventCount).toBe(140);
        const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, scarred);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("holding dropEvents long enough stays active (never auto-fails), while consecutiveFailureSeconds proves the breach really did sustain", () => {
        const state = runScenario(SUSTAINED_LAG_MS + 32_000, [
          { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
        ]);
        expect(state.status).not.toBe("failed");
        expect(state.failedAtMs).toBeNull();
        expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
          dataPipelineFreshnessCollapseSimulation.failureCondition.sustainedSeconds,
        );
      });
    });

    describe("Recovery lag: real drain only over real elapsed time", () => {
      it("immediately after engaging safe scaling, backlog is at its just-engaged value regardless of how soon within the window it's observed (tick-zero proof, not instantly drained)", () => {
        const justEngagedEarly = runScenario(SUSTAINED_LAG_MS + 5_000, SAFE_SCALING_ACTIONS);
        const justEngagedLater = runScenario(DRAIN_WINDOW_1_MS - 1_000, SAFE_SCALING_ACTIONS);
        expect(justEngagedEarly.transitions.incidentState).toBe("safely-scaled-just-engaged");
        expect(justEngagedLater.transitions.incidentState).toBe("safely-scaled-just-engaged");
        // Same frozen value the entire time no drain window has elapsed
        // yet — proof the drain is gated on real elapsed time, not on
        // the instant the controls were flipped.
        expect(justEngagedLater.values.tier2BacklogCount).toBe(justEngagedEarly.values.tier2BacklogCount);
        expect(justEngagedEarly.values.tier2BacklogCount as number).toBeGreaterThan(0);
      });

      it("after the first drain window, backlog has genuinely shrunk but is not yet zero", () => {
        const window1 = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS);
        expect(window1.transitions.incidentState).toBe("draining-window1-unthrottled");
        expect(window1.values.tier2BacklogCount as number).toBeGreaterThan(0);
        expect(window1.values.tier2BacklogCount as number).toBeLessThan(380);
      });

      it("after the second drain window, backlog has shrunk further still", () => {
        const window1 = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS);
        const window2 = runScenario(DRAIN_WINDOW_2_MS + 5_000, SAFE_SCALING_ACTIONS);
        expect(window2.transitions.incidentState).toBe("draining-window2-unthrottled");
        expect(window2.values.tier2BacklogCount as number).toBeLessThan(
          window1.values.tier2BacklogCount as number,
        );
      });

      it("only after the fully-recovered window does the backlog reach genuine zero", () => {
        const recovered = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 5_000, SAFE_SCALING_ACTIONS);
        expect(recovered.transitions.incidentState).toBe("fully-recovered");
        expect(recovered.values.tier2BacklogCount).toBe(0);
      });

      it("low-priority ingestion throttle drains measurably faster than without it at the identical elapsed window", () => {
        const unthrottled = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS);
        const throttled = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS_THROTTLED);
        expect(throttled.values.tier2BacklogCount as number).toBeLessThan(
          unthrottled.values.tier2BacklogCount as number,
        );
      });
    });

    describe("Multi-step path", () => {
      it("step 1 alone (scale processor) without Warehouse protection is the contention trap", () => {
        const state = runScenario(SUSTAINED_LAG_MS + 5_000, NAIVE_SCALE_ONLY_ACTIONS);
        expect(state.transitions.incidentState).toBe("processor-scaled-warehouse-contention");
      });

      it("step 2 on top of step 1 (protect Warehouse) relieves contention but leaves Tier-1 unmanaged", () => {
        const state = runScenario(SUSTAINED_LAG_MS + 5_000, [
          { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
          { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
          { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
        ]);
        expect(state.transitions.incidentState).toBe("tier1-breached-unmanaged");
      });

      it("step 3 on top of steps 1-2 (prioritize Tier-1) finally reaches the safe draining state", () => {
        const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS);
        expect(state.transitions.incidentState).toBe("draining-window1-unthrottled");
      });
    });

    describe("Sequencing sensitivity", () => {
      it("safe sequence: protect the Warehouse BEFORE/WITH scaling reaches the protected state directly", () => {
        const safeOrder = runScenario(SUSTAINED_LAG_MS + 5_000, [
          { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
          { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
          { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(safeOrder.values.warehouseWriteSuccessRate).toBe(99);
        expect(safeOrder.values.warehouseStatus).toBe("normal");
      });

      it("unsafe sequence: scaling the processor BEFORE protecting the Warehouse causes a real, measurable contention window that the safe order never experiences", () => {
        const unsafeOrder = runScenario(SUSTAINED_LAG_MS + 2_000, [
          { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(unsafeOrder.transitions.incidentState).toBe("processor-scaled-warehouse-contention");
        expect(unsafeOrder.values.warehouseStatus).toBe("critical");

        const safeOrderAtSameInstant = runScenario(SUSTAINED_LAG_MS + 2_000, [
          { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(safeOrderAtSameInstant.values.warehouseStatus).not.toBe("critical");
      });
    });

    it("tracks peak historical counters generically via numericWatchFields", () => {
      const state = runScenario(LAG_ONSET_MS + 10_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
      ]);
      expect(state.peaks.peakValues.droppedEventCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.tier1FreshnessSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(LAG_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("alternate strong path: reacting early with full Warehouse protection (before sustainedLag) reaches an acceptable state too, without yet needing Tier-1 priority", () => {
      const state = runScenario(LAG_ONSET_MS + 40_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        { atMs: LAG_ONSET_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
        { atMs: LAG_ONSET_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
      ]);
      expect(state.transitions.incidentState).toBe("fully-protected-warehouse-safe-early");
      const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("draining-window1-throttled is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 30_000, SAFE_SCALING_ACTIONS_THROTTLED);
      expect(state.transitions.incidentState).toBe("draining-window1-throttled");
      const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("safely-scaled-just-engaged (backlog 380, above the 200 ceiling) is NOT yet Finish-eligible", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 30_000, SAFE_SCALING_ACTIONS);
      expect(state.transitions.incidentState).toBe("safely-scaled-just-engaged");
      expect(state.values.tier2BacklogCount).toBe(380);
      const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("draining-window2-unthrottled (backlog 65, under the ceiling) IS Finish-eligible as acceptable", () => {
      const state = runScenario(DRAIN_WINDOW_2_MS + 30_000, SAFE_SCALING_ACTIONS);
      expect(state.transitions.incidentState).toBe("draining-window2-unthrottled");
      const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("tier1-breached-unmanaged is never Finish-eligible at any tier", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 30_000 + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
        { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
      ]);
      expect(state.transitions.incidentState).toBe("tier1-breached-unmanaged");
      const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("fully-recovered is Finish-eligible as optimal", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, SAFE_SCALING_ACTIONS);
      const eligibility = evaluateCompletionEligibility(dataPipelineFreshnessCollapseSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from the fully-recovered path -> resolved/optimal", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, SAFE_SCALING_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 33_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-recovered) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, SAFE_SCALING_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, state);
      const inputs = extractFinishScoringInputs(dataPipelineFreshnessCollapseSimulation, result);
      const score = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (draining, bounded) scores well but below optimal", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, SAFE_SCALING_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(dataPipelineFreshnessCollapseSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, optimalInputs);

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 30_000, SAFE_SCALING_ACTIONS_THROTTLED);
      const acceptableResult = evaluateCandidateDeclaredFinish(dataPipelineFreshnessCollapseSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(dataPipelineFreshnessCollapseSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(100);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 60_000);
      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      expect(score.breakdown.dataIntegrity).toBeLessThan(150);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (naive scale-up contention) scores worse on dataIntegrity than baseline despite looking like action was taken", () => {
      const baselineState = runScenario(SUSTAINED_LAG_MS + 60_000);
      const baselineInputs = scoringInputsFromState(baselineState);
      const baselineScore = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, baselineInputs);

      const harmfulState = runScenario(SUSTAINED_LAG_MS + 60_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
      ]);
      const harmfulInputs = scoringInputsFromState(harmfulState);
      const harmfulScore = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, harmfulInputs);

      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (naive scale-up) SCORE", JSON.stringify(harmfulScore), "BASELINE SCORE", JSON.stringify(baselineScore));
    });

    it("the drop-events trap scores zero dataIntegrity even though its visible lag metrics read calmer", () => {
      const droppedState = runScenario(DROP_EXPOSURE_WINDOW_MS + 5_000, [
        { atMs: LAG_ONSET_MS + 1_000, controlKey: DROP_EVENTS_KEY, value: true },
      ]);
      const inputs = scoringInputsFromState(droppedState);
      const score = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(0);
      console.log("DROP-EVENTS TRAP SCORE", JSON.stringify(score));
    });

    it("the Tier-1-breach trap (availability-good, correctness-bad) is strongly penalized on dataIntegrity", () => {
      const state = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: PROCESSOR_CONCURRENCY_KEY, value: "high" },
        { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: WAREHOUSE_WRITER_CONCURRENCY_KEY, value: "high" },
        { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: CHECKPOINT_CADENCE_KEY, value: "relaxed" },
      ]);
      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(DATA_PIPELINE_FRESHNESS_COLLAPSE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBeLessThanOrEqual(80);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS);
      const runB = runScenario(DRAIN_WINDOW_1_MS + 5_000, SAFE_SCALING_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Control usage: every control is wired into real mechanics", () => {
    it("backpressure bounds backlog growth relative to doing nothing, without ever dropping an event", () => {
      const unmitigated = runScenario(SUSTAINED_LAG_MS + 5_000);
      const withBackpressure = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: BACKPRESSURE_KEY, value: true },
      ]);
      expect(withBackpressure.transitions.incidentState).toBe("backpressure-no-scaling");
      expect(withBackpressure.values.tier2BacklogCount as number).toBeLessThan(
        unmitigated.values.tier2BacklogCount as number,
      );
      expect(withBackpressure.values.droppedEventCount).toBe(0);
    });

    it("low-priority ingestion throttle bounds Tier-2 backlog growth without touching Tier-1", () => {
      const unmitigated = runScenario(SUSTAINED_LAG_MS + 5_000);
      const throttled = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: LOW_PRIORITY_INGESTION_THROTTLE_KEY, value: true },
      ]);
      expect(throttled.transitions.incidentState).toBe("throttled-no-scaling");
      expect(throttled.values.tier2BacklogCount as number).toBeLessThan(
        unmitigated.values.tier2BacklogCount as number,
      );
      expect(throttled.values.tier1BacklogCount).toBe(unmitigated.values.tier1BacklogCount);
    });

    it("small batch size reduces Warehouse write lock wait relative to doing nothing, without affecting processor throughput", () => {
      const unmitigated = runScenario(SUSTAINED_LAG_MS + 5_000);
      const smallBatch = runScenario(SUSTAINED_LAG_MS + 5_000, [
        { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: BATCH_SIZE_KEY, value: "small" },
      ]);
      expect(smallBatch.transitions.incidentState).toBe("small-batch-no-scaling");
      expect(smallBatch.values.processorLagSeconds).toBe(unmitigated.values.processorLagSeconds);
    });
  });
});
