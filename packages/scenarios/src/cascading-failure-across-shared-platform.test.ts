import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cascadingFailureAcrossSharedPlatform } from "./cascading-failure-across-shared-platform";
import {
  ASYNC_WORKER_CONCURRENCY_KEY,
  ASYNC_WORKLOAD_DEFERRAL_KEY,
  CACHE_ASSIST_POLICY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  IDENTITY_CIRCUIT_BREAKER_KEY,
  IDENTITY_FAILURE_MODE_KEY,
  METADATA_WRITE_POLICY_KEY,
  PRODUCT_A_ISOLATION_KEY,
  PRODUCT_B_ISOLATION_KEY,
  PRODUCT_B_PRIORITY_KEY,
  PRODUCT_B_RETRY_POLICY_KEY,
  PRODUCT_C_ISOLATION_KEY,
  RESTORATION_ORDER_KEY,
  cascadingFailureAcrossSharedPlatformSimulation,
} from "./cascading-failure-across-shared-platform/definition";
import { cascadingFailureAcrossSharedPlatformCandidateUI } from "./cascading-failure-across-shared-platform/candidate-ui";
import { CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING } from "./cascading-failure-across-shared-platform/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  AMPLIFICATION_COMPOUNDED_MS,
  DB_DRAIN_WINDOW_1_MS,
  IDENTITY_DEGRADED_MS,
  MSG_DRAIN_WINDOW_2_MS,
  MSG_FULLY_DRAINED_MS,
  STARVATION_COMPOUNDED_MS,
  SUSTAINED_CASCADE_MS,
} from "./cascading-failure-across-shared-platform/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cascadingFailureAcrossSharedPlatformSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cascadingFailureAcrossSharedPlatformSimulation.tickMs
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
      cascadingFailureAcrossSharedPlatformSimulation,
      state,
      action,
      cascadingFailureAcrossSharedPlatformSimulation.tickMs,
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
    initialMonthlyInfrastructureCostUsd:
      cascadingFailureAcrossSharedPlatformSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Safe sequence (path 1 — full isolation): isolate the amplifier, protect
// the root, cap DB budget, THEN scale workers, THEN restore root-first
// only once both drain windows + identity recovery have elapsed.
const SAFE_FULL_ISOLATION_ACTIONS: TimedAction[] = [
  { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
  { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
  { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
  { atMs: DB_DRAIN_WINDOW_1_MS + 1_000, controlKey: ASYNC_WORKER_CONCURRENCY_KEY, value: "scaled" },
  {
    atMs: MSG_FULLY_DRAINED_MS + 1_000,
    controlKey: RESTORATION_ORDER_KEY,
    value: "root-first",
  },
];

// Safe sequence (path 2 — bounded retry + deprioritization, Product B
// never fully isolated).
const SAFE_BOUNDED_RETRY_ACTIONS: TimedAction[] = [
  { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_RETRY_POLICY_KEY, value: "bounded" },
  { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: PRODUCT_B_PRIORITY_KEY, value: "deprioritized" },
  { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
  { atMs: STARVATION_COMPOUNDED_MS + 4_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
  { atMs: DB_DRAIN_WINDOW_1_MS + 1_000, controlKey: ASYNC_WORKER_CONCURRENCY_KEY, value: "scaled" },
  {
    atMs: MSG_FULLY_DRAINED_MS + 1_000,
    controlKey: RESTORATION_ORDER_KEY,
    value: "root-first",
  },
];

// Unsafe sequence: scale Async Workers BEFORE capping the DB budget
// (pressure-transfer trap).
const PRESSURE_TRANSFER_WRONG_ORDER_ACTIONS: TimedAction[] = [
  { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: ASYNC_WORKER_CONCURRENCY_KEY, value: "scaled" },
];

// Unsafe sequence: contain + drain fully, then restore ALL-AT-ONCE
// before the drain windows have elapsed (premature restoration).
const PREMATURE_ALL_AT_ONCE_ACTIONS: TimedAction[] = [
  { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
  { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
  { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
  {
    atMs: SUSTAINED_CASCADE_MS + 10_000,
    controlKey: RESTORATION_ORDER_KEY,
    value: "all-at-once",
  },
];

// Wrong-root trap: isolate the loud product (Product B) without ever
// protecting Shared Identity or capping the DB budget.
const WRONG_ROOT_ACTIONS: TimedAction[] = [
  { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
];

// Harmful/unsafe availability-maximizing path: identity fail-open.
const FAIL_OPEN_ACTIONS: TimedAction[] = [
  { atMs: IDENTITY_DEGRADED_MS + 1_000, controlKey: IDENTITY_FAILURE_MODE_KEY, value: "fail-open" },
];

describe("Cascading Failure Across Shared Platform", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(cascadingFailureAcrossSharedPlatform.isFree).toBe(false);
      expect(cascadingFailureAcrossSharedPlatform.library?.category).toBe("Distributed Systems");
      expect(cascadingFailureAcrossSharedPlatform.library?.tags.length).toBeGreaterThan(0);
      expect(cascadingFailureAcrossSharedPlatform.library?.skills.length).toBeGreaterThan(0);
      expect(cascadingFailureAcrossSharedPlatform.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(cascadingFailureAcrossSharedPlatformCandidateUI.metrics.length).toBeGreaterThanOrEqual(15);
      expect(cascadingFailureAcrossSharedPlatformCandidateUI.controls.length).toBe(13);
      expect(cascadingFailureAcrossSharedPlatformCandidateUI.components.length).toBe(10);
    });

    it("the architecture has exactly 10 nodes and 10 edges matching the spec", () => {
      expect(cascadingFailureAcrossSharedPlatformSimulation.architecture.nodes.length).toBe(10);
      expect(cascadingFailureAcrossSharedPlatformSimulation.architecture.edges.length).toBe(10);
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(cascadingFailureAcrossSharedPlatform.description).toMatch(
        /a single product must not exhaust shared-platform capacity/i,
      );
      expect(cascadingFailureAcrossSharedPlatform.description).toMatch(
        /critical identity correctness must be preserved/i,
      );
      expect(cascadingFailureAcrossSharedPlatform.description).toMatch(
        /shared metadata\/database durability must not be traded away/i,
      );
      expect(cascadingFailureAcrossSharedPlatform.description).toMatch(
        /products may be intentionally degraded or isolated/i,
      );
      expect(cascadingFailureAcrossSharedPlatform.description).toMatch(
        /recovering the root dependency does not mean/i,
      );
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of cascadingFailureAcrossSharedPlatformSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control is referenced by at least one action classification", () => {
      const controlKeys = cascadingFailureAcrossSharedPlatformSimulation.controls.map((c) => c.key);
      const classifiedKeys = new Set(
        cascadingFailureAcrossSharedPlatformSimulation.actionClassifications.map((c) => c.controlKey),
      );
      for (const key of controlKeys) {
        expect(classifiedKeys.has(key)).toBe(true);
      }
    });
  });

  describe("Runtime — baseline / root cause", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(cascadingFailureAcrossSharedPlatformSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.identityValidationLatencyMs).toBe(40);
      expect(state.values.cumulativeConnectionExhaustionCount).toBe(0);
      expect(state.values.platformStatus).toBe("healthy");
    });

    it("identity degrades first while every product stays unaffected", () => {
      const state = runScenario(IDENTITY_DEGRADED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(IDENTITY_DEGRADED_MS);
      expect(state.values.identityStatus).toBe("warning");
      expect(state.values.productBErrorRatePercent).toBe(3);
      expect(state.values.productAErrorRatePercent).toBe(0.5);
      expect(state.values.productCErrorRatePercent).toBe(0.4);
    });

    it("baseline (no action) shows amplification-compounded with Product B loudest", () => {
      const state = runScenario(AMPLIFICATION_COMPOUNDED_MS + 1_000);
      expect(state.transitions.incidentState).toBe("amplifying-uncontained");
      expect(state.values.productBErrorRatePercent as number).toBeGreaterThan(
        state.values.productAErrorRatePercent as number,
      );
      expect(state.values.productBErrorRatePercent as number).toBeGreaterThan(
        state.values.productCErrorRatePercent as number,
      );
    });

    it("baseline (no action) eventually shows starvation compounding too, worse than amplification alone", () => {
      const state = runScenario(STARVATION_COMPOUNDED_MS + 1_000);
      expect(state.transitions.incidentState).toBe("full-cascade");
      expect(state.values.dbWriteSuccessRatePercent as number).toBeLessThan(50);
    });

    it("left fully unaddressed through sustainedCascade, the attempt fails on connection exhaustion", () => {
      const state = runScenario(SUSTAINED_CASCADE_MS + 35_000);
      expect(state.status).toBe("failed");
      expect(state.values.cumulativeConnectionExhaustionCount as number).toBeGreaterThanOrEqual(900);
    });
  });

  describe("Wrong-root / loudest-product trap", () => {
    it("isolating only the loud product (Product B) without protecting identity or the DB budget never resolves", () => {
      const state = runScenario(STARVATION_COMPOUNDED_MS + 1_000, WRONG_ROOT_ACTIONS);
      expect(state.transitions.incidentState).toBe("wrong-root-trap");
      expect(state.values.identitySuccessRate as number).toBeLessThan(70);
      expect(state.values.dbWriteSuccessRatePercent as number).toBeLessThan(70);
      expect(state.values.productBRestorationStatus).toBe("isolated");

      const eligibility = evaluateCompletionEligibility(
        cascadingFailureAcrossSharedPlatformSimulation,
        state,
      );
      expect(eligibility.eligible).toBe(false);
    });

    it("isolating the wrong (bystander) product wastes revenue while doing nothing for the platform", () => {
      const isolateBystander: TimedAction[] = [
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_C_ISOLATION_KEY, value: "isolated" },
      ];
      const state = runScenario(AMPLIFICATION_COMPOUNDED_MS + 5_000, isolateBystander);
      expect(state.transitions.incidentState).toBe("isolate-bystander-wasted");
      expect(state.values.identitySuccessRate as number).toBeLessThan(70);
    });

    it("isolating Product A directly relieves its own held connections but does not structurally protect the DB budget for other products", () => {
      const isolateProductA: TimedAction[] = [
        { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_A_ISOLATION_KEY, value: "isolated" },
      ];
      const state = runScenario(STARVATION_COMPOUNDED_MS + 5_000, isolateProductA);
      expect(state.transitions.incidentState).toBe("product-a-isolated-directly");
      expect(state.values.productAHeldConnectionCount as number).toBeLessThan(30);
      // The DB budget itself is still unbounded — the structural gap
      // for every OTHER product remains, distinct from capping it.
      expect(state.controlValues[DB_CONNECTION_BUDGET_KEY]).toBe("unbounded");
      expect(state.values.dbWriteSuccessRatePercent as number).toBeLessThan(90);
    });
  });

  describe("Correctness trap — identity fail-open", () => {
    it("fail-open never satisfies success/acceptable, and unverified grants accumulate and never reset", () => {
      const state = runScenario(IDENTITY_DEGRADED_MS + 20_000, FAIL_OPEN_ACTIONS);
      expect(state.transitions.incidentState).toBe("identity-fail-open-violation");
      expect(state.values.cumulativeUnverifiedGrantCount as number).toBeGreaterThan(0);
      expect(state.values.platformStatus).toBe("identity-correctness-violated");

      const eligibility = evaluateCompletionEligibility(
        cascadingFailureAcrossSharedPlatformSimulation,
        state,
      );
      expect(eligibility.eligible).toBe(false);
    });

    it("switching back to fail-closed stops NEW damage but the historical peak count never resets", () => {
      const switchBack: TimedAction[] = [
        ...FAIL_OPEN_ACTIONS,
        { atMs: IDENTITY_DEGRADED_MS + 10_000, controlKey: IDENTITY_FAILURE_MODE_KEY, value: "fail-closed" },
      ];
      const state = runScenario(IDENTITY_DEGRADED_MS + 20_000, switchBack);
      expect(state.values.cumulativeUnverifiedGrantCount).toBe(0);
      expect(state.peaks.peakValues.cumulativeUnverifiedGrantCount as number).toBeGreaterThan(0);
    });
  });

  describe("Pressure transfer — Async Workers scaled before DB budget capped", () => {
    it("scaling workers before capping the DB budget measurably worsens DB write success and exhaustion count", () => {
      const scaledFirst = runScenario(
        STARVATION_COMPOUNDED_MS + 10_000,
        PRESSURE_TRANSFER_WRONG_ORDER_ACTIONS,
      );
      const didNothing = runScenario(STARVATION_COMPOUNDED_MS + 10_000);

      expect(scaledFirst.transitions.incidentState).toBe("worker-scaling-pressure-transfer");
      expect(scaledFirst.values.dbWriteSuccessRatePercent as number).toBeLessThan(
        didNothing.values.dbWriteSuccessRatePercent as number,
      );
      expect(scaledFirst.values.cumulativeConnectionExhaustionCount as number).toBeGreaterThan(
        didNothing.values.cumulativeConnectionExhaustionCount as number,
      );
    });

    it("scaling workers AFTER capping the DB budget is safe and accelerates drain instead", () => {
      const cappedThenScaled: TimedAction[] = [
        { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
        { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
        { atMs: DB_DRAIN_WINDOW_1_MS + 1_000, controlKey: ASYNC_WORKER_CONCURRENCY_KEY, value: "scaled" },
      ];
      const state = runScenario(DB_DRAIN_WINDOW_1_MS + 5_000, cappedThenScaled);
      expect(state.transitions.incidentState).not.toBe("worker-scaling-pressure-transfer");
      expect(state.values.dbWriteSuccessRatePercent as number).toBeGreaterThan(90);
    });
  });

  describe("Independent root/messaging/metadata levers", () => {
    it("Shared Cache assist alone measurably reduces validation volume reaching Shared Identity, though incompletely", () => {
      const cacheOnly: TimedAction[] = [
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: CACHE_ASSIST_POLICY_KEY, value: "assist" },
      ];
      const withCache = runScenario(AMPLIFICATION_COMPOUNDED_MS + 5_000, cacheOnly);
      const withoutCache = runScenario(AMPLIFICATION_COMPOUNDED_MS + 5_000);

      expect(withCache.transitions.incidentState).toBe("cache-assist-only");
      expect(withCache.values.cacheAssistHitRatePercent as number).toBeGreaterThan(
        withoutCache.values.cacheAssistHitRatePercent as number,
      );
      expect(withCache.values.identitySuccessRate as number).toBeGreaterThan(
        withoutCache.values.identitySuccessRate as number,
      );
      // Still incomplete — identity is not yet actually protected.
      expect(withCache.values.identitySuccessRate as number).toBeLessThan(90);
    });

    it("Shared Metadata read-only mode protects write safety independent of every other control", () => {
      const metadataOnly: TimedAction[] = [
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: METADATA_WRITE_POLICY_KEY, value: "read-only" },
      ];
      const state = runScenario(AMPLIFICATION_COMPOUNDED_MS + 5_000, metadataOnly);
      expect(state.transitions.incidentState).toBe("metadata-protected-platform-exposed");
      expect(state.values.metadataWriteSafety).toBe("safe");
      // Protecting metadata alone does not protect the rest of the
      // platform.
      expect(state.values.identitySuccessRate as number).toBeLessThan(70);
    });

    it("Async workload deferral alone measurably slows messaging backlog growth without discarding work", () => {
      const deferralOnly: TimedAction[] = [
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: ASYNC_WORKLOAD_DEFERRAL_KEY, value: "deferred" },
      ];
      const withDeferral = runScenario(AMPLIFICATION_COMPOUNDED_MS + 5_000, deferralOnly);
      const withoutDeferral = runScenario(AMPLIFICATION_COMPOUNDED_MS + 5_000);

      expect(withDeferral.transitions.incidentState).toBe("deferral-only");
      expect(withDeferral.values.messagingBacklogCount as number).toBeLessThan(
        withoutDeferral.values.messagingBacklogCount as number,
      );
    });
  });

  describe("Recovery lag — two independently-paced subsystems", () => {
    it("containment alone does not instantly clear either backlog (recovery lag)", () => {
      const containOnly: TimedAction[] = [
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
      ];
      const state = runScenario(AMPLIFICATION_COMPOUNDED_MS + 10_000, containOnly);
      expect(state.transitions.incidentState).toBe("contained");
      expect(state.values.messagingBacklogCount as number).toBeGreaterThan(0);
    });

    it("messaging backlog and DB connection pressure drain at different, independent paces", () => {
      const contained: TimedAction[] = [
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
        { atMs: AMPLIFICATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
      ];
      const dbDoneMsgPartial = runScenario(MSG_DRAIN_WINDOW_2_MS + 1_000, contained);
      expect(dbDoneMsgPartial.transitions.incidentState).toBe("draining-window2");
      // DB has fully drained (utilization back to baseline) while
      // messaging still has a real, nonzero, still-draining backlog —
      // proof the two subsystems are not the same timer in disguise.
      expect(dbDoneMsgPartial.values.dbConnectionPoolUtilizationPercent).toBe(50);
      expect(dbDoneMsgPartial.values.messagingBacklogCount as number).toBeGreaterThan(0);

      const fullyDrained = runScenario(MSG_FULLY_DRAINED_MS + 1_000, contained);
      expect(fullyDrained.values.messagingBacklogCount).toBe(0);
    });
  });

  describe("Unsafe early restoration trap", () => {
    it("restoring all products at once before drain windows elapse retriggers the cascade", () => {
      const state = runScenario(SUSTAINED_CASCADE_MS + 15_000, PREMATURE_ALL_AT_ONCE_ACTIONS);
      expect(state.transitions.incidentState).toBe("re-cascaded");
      expect(state.values.platformStatus).toBe("re-cascading");
      expect(state.values.dbWriteSuccessRatePercent as number).toBeLessThan(70);
    });

    it("the same eventual controls, applied with deliberate root-first restoration after full drain, reach OPTIMAL safely", () => {
      const state = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("optimal-recovered");
      expect(state.values.platformStatus).toBe("recovered");
    });
  });

  describe("Strong sequencing — same final controls, different order, different safety outcome", () => {
    it("premature all-at-once restoration is measurably worse than deliberate root-first restoration reaching the same isolation set", () => {
      const premature = runScenario(SUSTAINED_CASCADE_MS + 15_000, PREMATURE_ALL_AT_ONCE_ACTIONS);
      const deliberate = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);

      expect(premature.values.platformStatus).toBe("re-cascading");
      expect(deliberate.values.platformStatus).toBe("recovered");
      expect(premature.values.dbWriteSuccessRatePercent as number).toBeLessThan(
        deliberate.values.dbWriteSuccessRatePercent as number,
      );
    });
  });

  describe("Alternate strong paths", () => {
    it("path 1 (full isolation) and path 2 (bounded retry + deprioritization) both reach OPTIMAL", () => {
      const path1 = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);
      const path2 = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_BOUNDED_RETRY_ACTIONS);

      expect(path1.transitions.incidentState).toBe("optimal-recovered");
      expect(path2.transitions.incidentState).toBe("optimal-recovered");
      expect(path1.values.platformStatus).toBe("recovered");
      expect(path2.values.platformStatus).toBe("recovered");
      // Path 2 never isolates Product B at all.
      expect(path2.controlValues[PRODUCT_B_ISOLATION_KEY]).toBe("normal");
    });
  });

  describe("Legitimate degraded-but-safe state (ACCEPTABLE tier)", () => {
    it("fully drained and safe, but not yet deliberately restored, reaches ACCEPTABLE not OPTIMAL", () => {
      const containedNoRestore: TimedAction[] = [
        { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
        { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
        { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
      ];
      const state = runScenario(MSG_FULLY_DRAINED_MS + 35_000, containedNoRestore);
      expect(state.transitions.incidentState).toBe("acceptable-drained-isolated");

      const eligibility = evaluateCompletionEligibility(
        cascadingFailureAcrossSharedPlatformSimulation,
        state,
      );
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Completion — candidate_declared Finish semantics", () => {
    it("immediate Finish with zero actions is declared_unstable", () => {
      const state = runScenario(IDENTITY_DEGRADED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(cascadingFailureAcrossSharedPlatformSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("declares resolved at the OPTIMAL tier once the full safe path is complete", () => {
      const state = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(cascadingFailureAcrossSharedPlatformSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("declares failed_unstable (via true failure) if left unaddressed long enough, never a false resolve", () => {
      const state = runScenario(SUSTAINED_CASCADE_MS + 35_000);
      const result = evaluateCandidateDeclaredFinish(cascadingFailureAcrossSharedPlatformSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).toBe("failed");
    });
  });

  describe("Scoring — optimal, acceptable, baseline, harmful, pressure-transfer, re-cascaded", () => {
    it("OPTIMAL path scores near the top with full dataIntegrity credit", () => {
      const state = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(cascadingFailureAcrossSharedPlatformSimulation, state);
      const inputs = extractFinishScoringInputs(cascadingFailureAcrossSharedPlatformSimulation, result);
      const score = scoreAuthoredAttempt(CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING, inputs);

      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
    });

    it("ACCEPTABLE path scores well but below OPTIMAL (real, justified gap)", () => {
      const containedNoRestore: TimedAction[] = [
        { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
        { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
        { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
      ];
      const optimalState = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(
        cascadingFailureAcrossSharedPlatformSimulation,
        optimalState,
      );
      const optimalScore = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        extractFinishScoringInputs(cascadingFailureAcrossSharedPlatformSimulation, optimalResult),
      );

      const acceptableState = runScenario(MSG_FULLY_DRAINED_MS + 35_000, containedNoRestore);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        cascadingFailureAcrossSharedPlatformSimulation,
        acceptableState,
      );
      expect(acceptableResult.completionTier).toBe("acceptable");
      const acceptableScore = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        extractFinishScoringInputs(cascadingFailureAcrossSharedPlatformSimulation, acceptableResult),
      );

      expect(acceptableScore.breakdown.dataIntegrity).toBe(170); // 200 - 30 "contained" penalty
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
    });

    it("zero-action baseline scores far below optimal and is not suspiciously high", () => {
      const state = runScenario(STARVATION_COMPOUNDED_MS + 5_000);
      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING, inputs);

      expect(score.breakdown.recovery).toBe(0); // unresolved terminal override
      expect(score.breakdown.reliability).toBe(0); // unresolved terminal override
      expect(score.total).toBeLessThan(400);
    });

    it("harmful (identity fail-open) scores far below baseline — a correctness-violating path is heavily penalized", () => {
      const baselineState = runScenario(IDENTITY_DEGRADED_MS + 20_000);
      const baselineInputs = scoringInputsFromState(baselineState);
      const baselineScore = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        baselineInputs,
      );

      const harmfulState = runScenario(IDENTITY_DEGRADED_MS + 20_000, FAIL_OPEN_ACTIONS);
      const harmfulInputs = scoringInputsFromState(harmfulState);
      const harmfulScore = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        harmfulInputs,
      );

      expect(harmfulScore.breakdown.dataIntegrity).toBe(0);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
    });

    it("re-cascaded (premature restoration) scores worse than contained-but-not-restored (ACCEPTABLE)", () => {
      const containedNoRestore: TimedAction[] = [
        { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: PRODUCT_B_ISOLATION_KEY, value: "isolated" },
        { atMs: STARVATION_COMPOUNDED_MS + 2_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
        { atMs: STARVATION_COMPOUNDED_MS + 3_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
      ];
      const acceptableState = runScenario(MSG_FULLY_DRAINED_MS + 35_000, containedNoRestore);
      const acceptableInputs = scoringInputsFromState(acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        acceptableInputs,
      );

      const reCascadedState = runScenario(SUSTAINED_CASCADE_MS + 15_000, PREMATURE_ALL_AT_ONCE_ACTIONS);
      const reCascadedInputs = scoringInputsFromState(reCascadedState);
      const reCascadedScore = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        reCascadedInputs,
      );

      expect(reCascadedScore.breakdown.dataIntegrity).toBeLessThan(
        acceptableScore.breakdown.dataIntegrity,
      );
    });

    it("alternate strong path (bounded retry) scores comparably to the full-isolation path — a genuine tradeoff, not a worse decoy", () => {
      const path1State = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_FULL_ISOLATION_ACTIONS);
      const path2State = runScenario(MSG_FULLY_DRAINED_MS + 35_000, SAFE_BOUNDED_RETRY_ACTIONS);

      const path1Result = evaluateCandidateDeclaredFinish(
        cascadingFailureAcrossSharedPlatformSimulation,
        path1State,
      );
      const path2Result = evaluateCandidateDeclaredFinish(
        cascadingFailureAcrossSharedPlatformSimulation,
        path2State,
      );

      const path1Score = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        extractFinishScoringInputs(cascadingFailureAcrossSharedPlatformSimulation, path1Result),
      );
      const path2Score = scoreAuthoredAttempt(
        CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING,
        extractFinishScoringInputs(cascadingFailureAcrossSharedPlatformSimulation, path2Result),
      );

      expect(path1Score.breakdown.dataIntegrity).toBe(path2Score.breakdown.dataIntegrity);
      expect(Math.abs(path1Score.total - path2Score.total)).toBeLessThan(60);
    });

    it("historical damage: fixing the DB budget after exhaustion already occurred cannot improperly restore a near-perfect score at that same instant", () => {
      // Scale workers unsafely first (incurring real exhaustion damage),
      // THEN cap the budget immediately after — current health recovers
      // fast, but the attempt is scored at the moment right after the
      // fix, while cumulative damage is still a real, nonzero, recent
      // memory (not yet long enough to look like a clean, fast resolve).
      const damageThenFix: TimedAction[] = [
        { atMs: STARVATION_COMPOUNDED_MS + 1_000, controlKey: ASYNC_WORKER_CONCURRENCY_KEY, value: "scaled" },
        { atMs: STARVATION_COMPOUNDED_MS + 20_000, controlKey: DB_CONNECTION_BUDGET_KEY, value: "capped" },
        { atMs: STARVATION_COMPOUNDED_MS + 21_000, controlKey: IDENTITY_CIRCUIT_BREAKER_KEY, value: "open" },
      ];
      const state = runScenario(STARVATION_COMPOUNDED_MS + 25_000, damageThenFix);
      // Peak damage is real and non-zero even though current health is
      // already recovering.
      expect(state.peaks.peakValues.cumulativeConnectionExhaustionCount as number).toBeGreaterThan(0);

      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(CASCADING_FAILURE_ACROSS_SHARED_PLATFORM_SCORING, inputs);
      // Still unresolved at this instant (drain windows haven't
      // elapsed) — recovery/reliability correctly stay at their
      // unresolved terminal override rather than rewarding the quick
      // current-health improvement as if it were a real resolution.
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
    });
  });

  describe("Determinism", () => {
    it("identical scenario + actions produce identical final state", () => {
      const stateA = runScenario(MSG_FULLY_DRAINED_MS + 1_000, SAFE_FULL_ISOLATION_ACTIONS);
      const stateB = runScenario(MSG_FULLY_DRAINED_MS + 1_000, SAFE_FULL_ISOLATION_ACTIONS);
      expect(stateA.values).toEqual(stateB.values);
      expect(stateA.transitions.incidentState).toEqual(stateB.transitions.incidentState);
      expect(stateA.customerImpact.revenueLossUsd).toEqual(stateB.customerImpact.revenueLossUsd);
    });
  });
});
