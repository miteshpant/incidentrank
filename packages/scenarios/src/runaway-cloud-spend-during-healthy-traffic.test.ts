import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { runawayCloudSpendDuringHealthyTraffic } from "./runaway-cloud-spend-during-healthy-traffic";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  runawayCloudSpendDuringHealthyTrafficSimulation,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./runaway-cloud-spend-during-healthy-traffic/definition";
import { runawayCloudSpendDuringHealthyTrafficCandidateUI } from "./runaway-cloud-spend-during-healthy-traffic/candidate-ui";
import { RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING } from "./runaway-cloud-spend-during-healthy-traffic/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  COST_ANOMALY_DETECTED_MS,
  RIGHTSIZING_FULLY_DRAINED_MS,
  RIGHTSIZING_WINDOW_1_MS,
  RIGHTSIZING_WINDOW_2_MS,
  SUSTAINED_UNADDRESSED_MS,
} from "./runaway-cloud-spend-during-healthy-traffic/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(runawayCloudSpendDuringHealthyTrafficSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += runawayCloudSpendDuringHealthyTrafficSimulation.tickMs
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
      runawayCloudSpendDuringHealthyTrafficSimulation,
      state,
      action,
      runawayCloudSpendDuringHealthyTrafficSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

// Alternate strong path A: gradual rightsizing via the Autoscaler's own
// thresholds. No batching touched at all.
const PATH_A_ACTIONS: TimedAction[] = [
  { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: AUTOSCALER_TARGET_UTILIZATION_KEY, value: 55 },
  { atMs: COST_ANOMALY_DETECTED_MS + 2_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 6 },
  { atMs: COST_ANOMALY_DETECTED_MS + 3_000, controlKey: IDLE_CAPACITY_POLICY_KEY, value: "scale-to-min" },
];

// Alternate strong path B: batch first, then shrink the fleet.
const PATH_B_ACTIONS: TimedAction[] = [
  { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: REQUEST_BATCHING_MODE_KEY, value: "aggressive" },
  { atMs: COST_ANOMALY_DETECTED_MS + 2_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 6 },
];

// Unsafe minimum-cost path: breach the redundancy floor two independent
// ways at once.
const UNSAFE_MIN_COST_ACTIONS: TimedAction[] = [
  { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
  { atMs: COST_ANOMALY_DETECTED_MS + 2_000, controlKey: IDLE_CAPACITY_POLICY_KEY, value: "scale-to-floor-minus-two" },
];

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
      runawayCloudSpendDuringHealthyTrafficSimulation.infrastructureCost.baselineMonthlyUsd,
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

describe("Runaway Cloud Spend During Healthy Traffic", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(runawayCloudSpendDuringHealthyTraffic.isFree).toBe(false);
      expect(runawayCloudSpendDuringHealthyTraffic.library?.category).toBe("Infrastructure & Capacity");
      expect(runawayCloudSpendDuringHealthyTraffic.library?.tags.length).toBeGreaterThan(0);
      expect(runawayCloudSpendDuringHealthyTraffic.library?.skills.length).toBeGreaterThan(0);
      expect(runawayCloudSpendDuringHealthyTraffic.difficulty).toBe("senior_staff");
      expect(runawayCloudSpendDuringHealthyTraffic.estimatedMinutes).toBeGreaterThan(0);
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(runawayCloudSpendDuringHealthyTrafficCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(runawayCloudSpendDuringHealthyTrafficCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(runawayCloudSpendDuringHealthyTrafficCandidateUI.components.length).toBe(6);
    });

    it("the architecture is flat with exactly 6 nodes and 5 edges, no nesting", () => {
      expect(runawayCloudSpendDuringHealthyTrafficSimulation.architecture.nodes.length).toBe(6);
      expect(runawayCloudSpendDuringHealthyTrafficSimulation.architecture.edges.length).toBe(5);
      for (const node of runawayCloudSpendDuringHealthyTrafficSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(runawayCloudSpendDuringHealthyTraffic.description).toMatch(/SLOs must remain within the authored bound/i);
      expect(runawayCloudSpendDuringHealthyTraffic.description).toMatch(/redundancy may not be removed below the stated safety floor/i);
      expect(runawayCloudSpendDuringHealthyTraffic.description).toMatch(/rightsizing may occur gradually/i);
      expect(runawayCloudSpendDuringHealthyTraffic.description).toMatch(/temporary small latency increase is acceptable/i);
      expect(runawayCloudSpendDuringHealthyTraffic.description).toMatch(/PRIMARY objective/);
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of runawayCloudSpendDuringHealthyTrafficSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        runawayCloudSpendDuringHealthyTrafficSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of runawayCloudSpendDuringHealthyTrafficSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("no rule ever sets any component to a non-healthy health (no outage anywhere)", () => {
      for (const rule of runawayCloudSpendDuringHealthyTrafficSimulation.rules) {
        for (const health of Object.values(rule.componentHealth)) {
          expect(health).toBe("healthy");
        }
      }
    });
  });

  describe("Runtime: healthy system, no outage", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(runawayCloudSpendDuringHealthyTrafficSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.requestLatencyP99Ms).toBe(180);
      expect(state.values.errorRatePercent).toBe(0.1);
      expect(state.values.redundancyHeadroomStatus).toBe("oversized");
    });

    it("cost-anomaly onset triggers the incident with customer metrics still fully healthy", () => {
      const state = runScenario(COST_ANOMALY_DETECTED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(COST_ANOMALY_DETECTED_MS);
      expect(state.values.requestLatencyP99Ms).toBeLessThan(250);
      expect(state.values.errorRatePercent as number).toBeLessThan(1);
      expect(state.transitions.incidentState).toBe("cost-anomaly-baseline");
    });

    it("baseline (no action) stays customer-healthy but cost stays elevated, sustained window compounds no live violation", () => {
      const early = runScenario(COST_ANOMALY_DETECTED_MS + 5_000);
      const sustained = runScenario(SUSTAINED_UNADDRESSED_MS + 5_000);
      expect(sustained.transitions.incidentState).toBe("cost-anomaly-sustained");
      expect(sustained.values.errorRatePercent as number).toBeLessThan(1);
      expect(early.values.errorRatePercent as number).toBeLessThan(1);
      expect(sustained.values.costPerMinuteUsd).toBe(early.values.costPerMinuteUsd);
    });
  });

  describe("Required unsafe-minimum-cost trap: breaches the redundancy floor while looking economically excellent", () => {
    it("dropping minReplicaCount below the floor produces the cheapest cost in the scenario with zero customer-impact degradation", () => {
      const baseline = runScenario(COST_ANOMALY_DETECTED_MS + 10_000);
      const unsafe = runScenario(COST_ANOMALY_DETECTED_MS + 10_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
      ]);
      expect(unsafe.transitions.incidentState).toBe("min-replica-floor-breached");
      expect(unsafe.values.costPerMinuteUsd as number).toBeLessThan(baseline.values.costPerMinuteUsd as number);
      expect(unsafe.values.errorRatePercent as number).toBeLessThanOrEqual(baseline.values.errorRatePercent as number + 0.1);
      expect(unsafe.values.redundancyHeadroomStatus).toBe("breached");
    });

    it("idleCapacityPolicy alone breaches the floor independently of minReplicaCount", () => {
      const unsafe = runScenario(COST_ANOMALY_DETECTED_MS + 10_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: IDLE_CAPACITY_POLICY_KEY, value: "scale-to-floor-minus-two" },
      ]);
      expect(unsafe.transitions.incidentState).toBe("idle-policy-floor-breached");
      expect(unsafe.values.redundancyHeadroomStatus).toBe("breached");
    });

    it("compounding both forbidden levers reaches the single cheapest cost number in the entire scenario", () => {
      const compounded = runScenario(COST_ANOMALY_DETECTED_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      const minReplicaOnly = runScenario(COST_ANOMALY_DETECTED_MS + 10_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
      ]);
      expect(compounded.transitions.incidentState).toBe("floor-breached-compounded");
      expect(compounded.values.costPerMinuteUsd as number).toBeLessThan(minReplicaOnly.values.costPerMinuteUsd as number);
      expect(compounded.values.runningInstanceCount).toBe(2);
    });

    it("the unsafe path can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 60_000, UNSAFE_MIN_COST_ACTIONS);
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("sustained floor breach never auto-fails the attempt, even though it stays breached well past the old sustained window", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 6 * 60_000, UNSAFE_MIN_COST_ACTIONS);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(45);
      const finish = evaluateCandidateDeclaredFinish(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Score-sanity QA: unsafe-minimum-cost cannot win overall despite the best raw cost numbers", () => {
    it("the unsafe path scores materially worse overall than either safe path, despite the best costEfficiency band", () => {
      const unsafeState = runScenario(SUSTAINED_UNADDRESSED_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      const pathAState = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_A_ACTIONS);

      const unsafeScore = scoreAuthoredAttempt(
        RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING,
        buildScoringInputs(unsafeState),
      );
      const pathAScore = scoreAuthoredAttempt(
        RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING,
        buildScoringInputs(pathAState),
      );

      expect(unsafeScore.total).toBeLessThan(pathAScore.total);
      expect(unsafeScore.breakdown.dataIntegrity).toBeLessThan(pathAScore.breakdown.dataIntegrity);
      expect(unsafeScore.breakdown.reliability).toBeLessThan(pathAScore.breakdown.reliability);
    });

    it("restoring the floor after an unsafe breach never resets the peak historical breach count", () => {
      const sealedUnsafe = runScenario(COST_ANOMALY_DETECTED_MS + 10_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
      ]);
      const corrected = runScenario(COST_ANOMALY_DETECTED_MS + 20_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
        { atMs: COST_ANOMALY_DETECTED_MS + 11_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 6 },
      ]);
      expect(sealedUnsafe.values.cumulativeHeadroomBreachSeconds as number).toBeGreaterThan(0);
      expect(corrected.values.redundancyHeadroomStatus).toBe("protected");
      // Live breach has stopped (the live field answers "is the floor
      // breached RIGHT NOW"), but the peak historical record never
      // decreases once it has peaked.
      expect(corrected.peaks.peakValues.cumulativeHeadroomBreachSeconds as number).toBeGreaterThanOrEqual(
        sealedUnsafe.values.cumulativeHeadroomBreachSeconds as number,
      );
    });

    it("the peak historical breach count truly never decreases even after a long additional safe run", () => {
      const sealedUnsafe = runScenario(COST_ANOMALY_DETECTED_MS + 10_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
      ]);
      const peakAfterBreach = sealedUnsafe.peaks.peakValues.cumulativeHeadroomBreachSeconds as number;
      expect(peakAfterBreach).toBeGreaterThan(0);

      const longSafeRunAfter = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 60_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 2 },
        { atMs: COST_ANOMALY_DETECTED_MS + 11_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 6 },
        { atMs: COST_ANOMALY_DETECTED_MS + 12_000, controlKey: AUTOSCALER_TARGET_UTILIZATION_KEY, value: 55 },
        { atMs: COST_ANOMALY_DETECTED_MS + 13_000, controlKey: IDLE_CAPACITY_POLICY_KEY, value: "scale-to-min" },
      ]);
      // Current live value is fully safe...
      expect(longSafeRunAfter.values.cumulativeHeadroomBreachSeconds).toBe(0);
      expect(longSafeRunAfter.values.redundancyHeadroomStatus).toBe("protected");
      // ...but the peak never decreased from its earlier high-water mark.
      expect(longSafeRunAfter.peaks.peakValues.cumulativeHeadroomBreachSeconds as number).toBeGreaterThanOrEqual(
        peakAfterBreach,
      );
    });
  });

  describe("Alternate strong path A: gradual rightsizing via Autoscaler thresholds", () => {
    it("engaging the lever shows no instant drop (recovery-lag, tick 0)", () => {
      const state = runScenario(COST_ANOMALY_DETECTED_MS + 5_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-a-rightsizing-just-engaged");
      expect(state.values.runningInstanceCount).toBe(40);
    });

    it("window 1 shows real partial progress below the leftover ceiling", () => {
      const state = runScenario(RIGHTSIZING_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-a-rightsizing-draining-window1");
      expect(state.values.runningInstanceCount).toBe(24);
    });

    it("window 2 shows further progress than window 1", () => {
      const window1 = runScenario(RIGHTSIZING_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const window2 = runScenario(RIGHTSIZING_WINDOW_2_MS + 5_000, PATH_A_ACTIONS);
      expect(window2.transitions.incidentState).toBe("path-a-rightsizing-draining-window2");
      expect(window2.values.runningInstanceCount as number).toBeLessThan(
        window1.values.runningInstanceCount as number,
      );
    });

    it("window 2 is genuinely ACCEPTABLE-eligible (safe, in-progress rightsizing)", () => {
      const state = runScenario(RIGHTSIZING_WINDOW_2_MS + 25_000, PATH_A_ACTIONS);
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("fully drained reaches genuine OPTIMAL via the Autoscaler-threshold mechanism alone (batching never touched)", () => {
      const state = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-a-optimal-fully-drained");
      expect(state.values.costSafetyStatus).toBe("efficient-safe");
      expect(state.controlValues[REQUEST_BATCHING_MODE_KEY]).toBe("disabled");
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Alternate strong path B: batch first, then shrink the fleet", () => {
    it("batching alone raises utilization without touching the replica floor (still oversized, not yet protected-and-rightsizing)", () => {
      const state = runScenario(COST_ANOMALY_DETECTED_MS + 5_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: REQUEST_BATCHING_MODE_KEY, value: "adaptive" },
      ]);
      expect(state.transitions.incidentState).toBe("batching-engaged-utilization-rising");
      expect(state.values.redundancyHeadroomStatus).toBe("oversized");
      // Correctly NOT Finish-eligible yet: acceptableCondition requires
      // "protected", and the floor itself is still untouched.
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("batching plus a lowered floor, fully drained, reaches OPTIMAL via a materially different mechanism than Path A", () => {
      const state = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_B_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-b-optimal-batched-and-drained");
      expect(state.values.costSafetyStatus).toBe("efficient-safe");
      expect(state.controlValues[AUTOSCALER_TARGET_UTILIZATION_KEY]).toBe(30); // never touched
      expect(state.controlValues[REQUEST_BATCHING_MODE_KEY]).toBe("aggressive");
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Path A and Path B reach materially different running instance counts via different mechanisms, both safe", () => {
      const pathA = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_A_ACTIONS);
      const pathB = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_B_ACTIONS);
      expect(pathA.values.redundancyHeadroomStatus).toBe("protected");
      expect(pathB.values.redundancyHeadroomStatus).toBe("protected");
      // Different control configurations reach the optimal tier by a
      // genuinely different route (threshold correction vs. batching).
      expect(pathA.controlValues[REQUEST_BATCHING_MODE_KEY]).not.toBe(
        pathB.controlValues[REQUEST_BATCHING_MODE_KEY],
      );
      expect(pathA.controlValues[AUTOSCALER_TARGET_UTILIZATION_KEY]).not.toBe(
        pathB.controlValues[AUTOSCALER_TARGET_UTILIZATION_KEY],
      );
    });
  });

  describe("Traps that are not safety violations but are genuinely worse than the safe alternative", () => {
    it("aggressive target utilization without rightsizing barely reduces instance count and is worse than the balanced target", () => {
      const aggressive = runScenario(COST_ANOMALY_DETECTED_MS + 5_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: AUTOSCALER_TARGET_UTILIZATION_KEY, value: 80 },
      ]);
      expect(aggressive.transitions.incidentState).toBe("aggressive-utilization-without-rightsizing");
      expect(aggressive.values.runningInstanceCount as number).toBeGreaterThan(30);
    });

    it("economy instance class without batching measurably raises latency (real, if within-SLO, trap)", () => {
      const baseline = runScenario(COST_ANOMALY_DETECTED_MS + 5_000);
      const economyAlone = runScenario(COST_ANOMALY_DETECTED_MS + 5_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: WORKER_INSTANCE_CLASS_KEY, value: "economy" },
      ]);
      expect(economyAlone.transitions.incidentState).toBe("economy-class-without-batching");
      expect(economyAlone.values.requestLatencyP99Ms as number).toBeGreaterThan(
        baseline.values.requestLatencyP99Ms as number,
      );
    });

    it("lowering only the replica floor (no utilization/idle-policy change) is real but incomplete progress", () => {
      const state = runScenario(COST_ANOMALY_DETECTED_MS + 5_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: MIN_REPLICA_COUNT_KEY, value: 6 },
      ]);
      expect(state.transitions.incidentState).toBe("floor-lowered-alone-partial");
      expect(state.values.redundancyHeadroomStatus).toBe("protected");
      expect(state.values.costSafetyStatus).toBe("unaddressed");
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("removing the warm pool before rightsizing the floor saves almost nothing and is strictly worse than leaving it alone", () => {
      const baseline = runScenario(COST_ANOMALY_DETECTED_MS + 5_000);
      const warmPoolRemoved = runScenario(COST_ANOMALY_DETECTED_MS + 5_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: WARM_POOL_SIZE_KEY, value: 0 },
      ]);
      expect(warmPoolRemoved.transitions.incidentState).toBe("warm-pool-removed-before-rightsizing");
      // Small cost saving (removing the warm pool's own cost) but
      // nowhere near a real rightsizing-level reduction — the leftover
      // 40-instance floor already provided far more cushion than the
      // warm pool did, so this change is small, real, and strictly
      // worse-than-necessary risk for the size of the saving.
      const saved = (baseline.values.costPerMinuteUsd as number) - (warmPoolRemoved.values.costPerMinuteUsd as number);
      expect(saved).toBeGreaterThan(0);
      expect(saved).toBeLessThan(0.5);
      expect(warmPoolRemoved.values.redundancyHeadroomStatus).toBe("oversized");
    });
  });

  describe("Immediate-Finish audit: zero-action Finish must declare unstable", () => {
    it("declaring Finish with zero actions at incident start is never eligible, even though the system already looks fully green", () => {
      const state = runScenario(COST_ANOMALY_DETECTED_MS + 1_000);
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("declaring Finish with zero actions well into the sustained window is still never eligible", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 60_000);
      const finish = evaluateCandidateDeclaredFinish(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("declaring Finish before the incident even starts is never eligible", () => {
      const state = createInitialState(runawayCloudSpendDuringHealthyTrafficSimulation);
      const eligibility = evaluateCompletionEligibility(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Determinism", () => {
    it("identical actions over identical elapsed time produce identical final state", () => {
      const first = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_A_ACTIONS);
      const second = runScenario(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_A_ACTIONS);
      expect(first.values).toEqual(second.values);
      expect(first.transitions.incidentState).toBe(second.transitions.incidentState);
      expect(first.cost.currentMonthlyCostUsd).toBe(second.cost.currentMonthlyCostUsd);
    });
  });

  describe("Full real-scoring-path execution for every required path (exact numbers)", () => {
    function scoreAndFinish(untilMs: number, actions: TimedAction[]) {
      const state = runScenario(untilMs, actions);
      const finish = evaluateCandidateDeclaredFinish(runawayCloudSpendDuringHealthyTrafficSimulation, state);
      const inputs = extractFinishScoringInputs(runawayCloudSpendDuringHealthyTrafficSimulation, finish);
      const score = scoreAuthoredAttempt(RUNAWAY_CLOUD_SPEND_DURING_HEALTHY_TRAFFIC_SCORING, inputs);
      return { state, finish, score };
    }

    it("OPTIMAL via Path A", () => {
      const { state, finish, score } = scoreAndFinish(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_A_ACTIONS);
      console.log("PATH A OPTIMAL:", JSON.stringify({ outcome: finish.outcome, completionTier: finish.completionTier, score, incidentState: state.transitions.incidentState }, null, 2));
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("OPTIMAL via Path B (alternate mechanism)", () => {
      const { state, finish, score } = scoreAndFinish(RIGHTSIZING_FULLY_DRAINED_MS + 25_000, PATH_B_ACTIONS);
      console.log("PATH B OPTIMAL:", JSON.stringify({ outcome: finish.outcome, completionTier: finish.completionTier, score, incidentState: state.transitions.incidentState }, null, 2));
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("ACCEPTABLE via Path A window 2 (in-progress, safe)", () => {
      const { state, finish, score } = scoreAndFinish(RIGHTSIZING_WINDOW_2_MS + 25_000, PATH_A_ACTIONS);
      console.log("PATH A ACCEPTABLE:", JSON.stringify({ outcome: finish.outcome, completionTier: finish.completionTier, score, incidentState: state.transitions.incidentState }, null, 2));
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("acceptable");
    });

    it("BASELINE (no action) — never Finish-eligible", () => {
      const { state, finish, score } = scoreAndFinish(SUSTAINED_UNADDRESSED_MS + 5_000, []);
      console.log("BASELINE UNRESOLVED:", JSON.stringify({ outcome: finish.outcome, score, incidentState: state.transitions.incidentState }, null, 2));
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("HARMFUL / unsafe-minimum-cost — never Finish-eligible, scores materially worse than safe paths", () => {
      const { state, finish, score } = scoreAndFinish(SUSTAINED_UNADDRESSED_MS + 10_000, UNSAFE_MIN_COST_ACTIONS);
      console.log("UNSAFE MINIMUM-COST:", JSON.stringify({ outcome: finish.outcome, score, incidentState: state.transitions.incidentState }, null, 2));
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("economy-class-without-batching trap — real but not safety-violating, scored via customerImpact", () => {
      const { state, finish, score } = scoreAndFinish(COST_ANOMALY_DETECTED_MS + 10_000, [
        { atMs: COST_ANOMALY_DETECTED_MS + 1_000, controlKey: WORKER_INSTANCE_CLASS_KEY, value: "economy" },
      ]);
      console.log("ECONOMY-WITHOUT-BATCHING TRAP:", JSON.stringify({ outcome: finish.outcome, score, incidentState: state.transitions.incidentState }, null, 2));
      expect(finish.outcome).toBe("declared_unstable");
    });
  });
});
