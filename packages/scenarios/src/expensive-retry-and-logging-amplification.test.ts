import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { expensiveRetryAndLoggingAmplification } from "./expensive-retry-and-logging-amplification";
import {
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
  expensiveRetryAndLoggingAmplificationSimulation,
} from "./expensive-retry-and-logging-amplification/definition";
import { expensiveRetryAndLoggingAmplificationCandidateUI } from "./expensive-retry-and-logging-amplification/candidate-ui";
import { EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING } from "./expensive-retry-and-logging-amplification/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  COST_SETTLING_FULLY_DONE_MS,
  COST_SETTLING_WINDOW_1_MS,
  DEPLOY_REGRESSION_DETECTED_MS,
  SUSTAINED_UNADDRESSED_MS,
} from "./expensive-retry-and-logging-amplification/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(expensiveRetryAndLoggingAmplificationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += expensiveRetryAndLoggingAmplificationSimulation.tickMs
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
      expensiveRetryAndLoggingAmplificationSimulation,
      state,
      action,
      expensiveRetryAndLoggingAmplificationSimulation.tickMs,
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
      expensiveRetryAndLoggingAmplificationSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: retry-amplification reduced; logging/telemetry
// noise left largely untouched.
const RETRY_FIX_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNADDRESSED_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 1 },
  { atMs: SUSTAINED_UNADDRESSED_MS + 2_000, controlKey: RETRY_OWNERSHIP_KEY, value: "worker-owns-retries" },
];

// Alternate strong path B: telemetry/logging noise reduced; retries left
// exactly as the deploy left them.
const TELEMETRY_FIX_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNADDRESSED_MS + 1_000, controlKey: SAMPLING_RATE_PERCENT_KEY, value: 10 },
  { atMs: SUSTAINED_UNADDRESSED_MS + 2_000, controlKey: TELEMETRY_DUPLICATION_KEY, value: "deduplicated" },
  { atMs: SUSTAINED_UNADDRESSED_MS + 3_000, controlKey: PAYLOAD_LOGGING_MODE_KEY, value: "metadata-only" },
];

// Combined OPTIMAL path: both alternate strong paths engaged together.
const COMBINED_OPTIMAL_ACTIONS: TimedAction[] = [...RETRY_FIX_ACTIONS, ...TELEMETRY_FIX_ACTIONS];

describe("Expensive Retry and Logging Amplification", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(expensiveRetryAndLoggingAmplification.isFree).toBe(false);
      expect(expensiveRetryAndLoggingAmplification.library?.category).toBe("Deployments & Reliability");
      expect(expensiveRetryAndLoggingAmplification.library?.tags.length).toBeGreaterThan(0);
      expect(expensiveRetryAndLoggingAmplification.library?.skills.length).toBeGreaterThan(0);
      expect(expensiveRetryAndLoggingAmplification.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(expensiveRetryAndLoggingAmplificationCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(expensiveRetryAndLoggingAmplificationCandidateUI.controls.length).toBeGreaterThanOrEqual(8);
      expect(expensiveRetryAndLoggingAmplificationCandidateUI.components.length).toBe(5);
    });

    it("the architecture has exactly 5 nodes and 5 edges matching the spec, flat (no nesting)", () => {
      expect(expensiveRetryAndLoggingAmplificationSimulation.architecture.nodes.length).toBe(5);
      expect(expensiveRetryAndLoggingAmplificationSimulation.architecture.edges.length).toBe(5);
      for (const node of expensiveRetryAndLoggingAmplificationSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(expensiveRetryAndLoggingAmplification.description).toMatch(
        /security\/audit-required logs must remain intact/i,
      );
      expect(expensiveRetryAndLoggingAmplification.description).toMatch(
        /operational debugging signal must remain sufficient/i,
      );
      expect(expensiveRetryAndLoggingAmplification.description).toMatch(
        /retries must preserve correctness and bounded reliability/i,
      );
      expect(expensiveRetryAndLoggingAmplification.description).toMatch(
        /duplicate and noisy logs may be reduced freely/i,
      );
      expect(expensiveRetryAndLoggingAmplification.description).toMatch(
        /cost reduction must never blind operators or violate audit requirements/i,
      );
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of expensiveRetryAndLoggingAmplificationSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        expensiveRetryAndLoggingAmplificationSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of expensiveRetryAndLoggingAmplificationSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("every control's every allowed value has at least one action classification", () => {
      for (const control of expensiveRetryAndLoggingAmplificationSimulation.controls) {
        for (const value of control.allowedValues) {
          const matched = expensiveRetryAndLoggingAmplificationSimulation.actionClassifications.some(
            (r) => r.controlKey === control.key && r.valueEquals === value,
          );
          expect(matched).toBe(true);
        }
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(expensiveRetryAndLoggingAmplificationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.auditLogIntegrityStatus).toBe("intact");
      expect(state.values.cumulativeAuditLogBlindWindowSeconds).toBe(0);
    });

    it("deploy regression detected triggers the incident with elevated cost but no outage", () => {
      const state = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DEPLOY_REGRESSION_DETECTED_MS);
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
      expect(state.values.costOverrunPercent as number).toBeGreaterThan(0);
      expect(state.values.auditLogIntegrityStatus).toBe("intact");
    });

    it("baseline (no action) leaves cost elevated and never touches audit integrity", () => {
      const state = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 5_000);
      expect(state.transitions.incidentState).toBe("unaddressed-baseline");
      expect(state.values.costOverrunPercent).toBe(210);
      expect(state.values.auditLogIntegrityStatus).toBe("intact");
    });

    it("leaving cost unaddressed long enough reaches the sustained baseline, requestSuccessRate stays near its ceiling throughout (decoy signal)", () => {
      const early = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 5_000);
      const sustained = runScenario(SUSTAINED_UNADDRESSED_MS + 5_000);
      expect(sustained.transitions.incidentState).toBe("unaddressed-sustained");
      expect(sustained.values.requestSuccessRate as number).toBeGreaterThan(99);
      expect(early.values.requestSuccessRate as number).toBeGreaterThan(99);
      // Cost does not worsen further on its own while unaddressed.
      expect(sustained.values.costOverrunPercent).toBe(early.values.costOverrunPercent);
    });

    it("the External Dependency never degrades — a real decoy node", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 5_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      expect(state.componentHealth["external-dependency"]).toBe("healthy");
    });
  });

  describe("Required unsafe path: disabling audit logging", () => {
    it("loggingLevel = off looks cheap and healthy but opens a real, nonzero audit blind window", () => {
      const baseline = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000);
      const auditOff = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      expect(auditOff.transitions.incidentState).toBe("cost-cut-unsafe");
      // Availability is at least as good as baseline.
      expect(auditOff.values.requestSuccessRate as number).toBeGreaterThanOrEqual(
        baseline.values.requestSuccessRate as number,
      );
      // Cost looks BETTER than baseline...
      expect(auditOff.values.costOverrunPercent as number).toBeLessThan(
        baseline.values.costOverrunPercent as number,
      );
      // ...but a real, nonzero audit-log blind window is now open.
      expect(auditOff.values.auditLogIntegrityStatus).toBe("blind-window");
      expect(auditOff.values.cumulativeAuditLogBlindWindowSeconds as number).toBeGreaterThan(0);
      expect(auditOff.values.operationalDebugSignalPercent).toBe(0);
    });

    it("held through the sustained window, the blind-window count compounds further", () => {
      const early = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      const settled = runScenario(COST_SETTLING_FULLY_DONE_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      expect(settled.transitions.incidentState).toBe("cost-cut-unsafe-settled");
      expect(settled.values.cumulativeAuditLogBlindWindowSeconds as number).toBeGreaterThan(
        early.values.cumulativeAuditLogBlindWindowSeconds as number,
      );
    });

    it("audit-off can never be Finish-eligible, however good cost looks", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      const eligibility = evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("sustained audit-off stays active (never auto-fails) even once the breach has sustained well past the old failure window", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 6 * 60_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        expensiveRetryAndLoggingAmplificationSimulation.failureCondition.sustainedSeconds,
      );
      const finish = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Security/audit QA: audit-off cannot be laundered into a safe outcome", () => {
    it("restoring logging stops NEW blind-window accrual but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      const correctedState = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 20_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 11_000, controlKey: LOGGING_LEVEL_KEY, value: "verbose" },
      ]);
      expect(sealedUnsafeState.values.auditLogIntegrityStatus).toBe("blind-window");
      expect(correctedState.values.auditLogIntegrityStatus).toBe("intact");
      expect(correctedState.peaks.peakValues.cumulativeAuditLogBlindWindowSeconds as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeAuditLogBlindWindowSeconds as number,
      );
    });

    it("full remediation after an audit-off window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 2_000, controlKey: LOGGING_LEVEL_KEY, value: "verbose" },
        ...COMBINED_OPTIMAL_ACTIONS,
      ]);
      expect(state.transitions.incidentState).toBe("cost-optimized-safe");
      expect(state.values.auditLogIntegrityStatus).toBe("intact");
      expect(state.values.costOverrunPercent).toBe(0);
      // Live correctness is fully safe right now.
      expect(state.values.cumulativeAuditLogBlindWindowSeconds).toBe(0);
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier audit-off window
      // this attempt passed through.
      expect(state.peaks.peakValues.cumulativeAuditLogBlindWindowSeconds as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Reliability overreach: removing retries entirely", () => {
    it("retryCount = 0 maximizes dependency-cost savings but genuinely regresses requestSuccessRate", () => {
      const baseline = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000);
      const overreach = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 0 },
      ]);
      expect(overreach.transitions.incidentState).toBe("retry-removed-overreach");
      expect(overreach.values.dependencyRequestCostUsdPerMonth as number).toBeLessThan(
        baseline.values.dependencyRequestCostUsdPerMonth as number,
      );
      expect(overreach.values.requestSuccessRate as number).toBeLessThan(
        baseline.values.requestSuccessRate as number,
      );
      expect(overreach.values.auditLogIntegrityStatus).toBe("intact");
    });

    it("retryCount = 1 captures real savings without the reliability regression", () => {
      const overreach = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 0 },
      ]);
      const safeReduction = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 1 },
      ]);
      expect(safeReduction.values.requestSuccessRate as number).toBeGreaterThan(
        overreach.values.requestSuccessRate as number,
      );
    });
  });

  describe("Legitimate degraded-but-safe state: safe-but-wasteful (standard logging)", () => {
    it("guarantees audit integrity and full debug signal at a real, bounded cost reduction", () => {
      const state = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 40_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "standard" },
      ]);
      expect(state.transitions.incidentState).toBe("safe-but-wasteful");
      expect(state.values.auditLogIntegrityStatus).toBe("intact");
      expect(state.values.operationalDebugSignalPercent).toBe(100);
      // Real but partial: still well above the optimal floor.
      expect(state.values.costOverrunPercent as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("held indefinitely, safe-but-wasteful never produces an audit violation, unlike the audit-off trap", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 5 * 60_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "standard" },
      ]);
      expect(state.values.auditLogIntegrityStatus).toBe("intact");
      expect(state.values.cumulativeAuditLogBlindWindowSeconds).toBe(0);
    });
  });

  describe("Cost settling: reductions take real elapsed time to reflect", () => {
    it("immediately after engaging a cost lever, cost has not yet reflected it at full settled value", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 4_000, RETRY_FIX_ACTIONS);
      // Not yet in the settled retry-amplification-reduced state (no
      // costSettlingFullyDone trigger yet) — still matches the plain
      // unaddressed baseline family.
      expect(state.transitions.incidentState).not.toBe("retry-amplification-reduced");
    });

    it("alternate strong path A (retry fix) reaches real, partial progress once settled", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, RETRY_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("retry-amplification-reduced");
      expect(state.values.costOverrunPercent as number).toBeLessThan(210);
      expect(state.values.costOverrunPercent as number).toBeGreaterThan(0);
    });

    it("alternate strong path B (telemetry fix) reaches real, partial progress once settled", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, TELEMETRY_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("telemetry-noise-reduced");
      expect(state.values.costOverrunPercent as number).toBeLessThan(210);
      expect(state.values.costOverrunPercent as number).toBeGreaterThan(0);
    });

    it("only after combining both alternate strong paths AND the full settling window does cost reach the OPTIMAL floor", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, COMBINED_OPTIMAL_ACTIONS);
      expect(state.transitions.incidentState).toBe("cost-optimized-safe");
      expect(state.values.costOverrunPercent).toBe(0);
    });
  });

  describe("Alternate strong paths: retry-fix and telemetry-fix are both real, distinct, independently-partial mechanisms", () => {
    it("path A reduces dependency cost sharply while leaving logging/telemetry cost high", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, RETRY_FIX_ACTIONS);
      expect(state.values.dependencyRequestCostUsdPerMonth).toBe(16_000);
      expect(state.values.loggingCostUsdPerMonth as number).toBeGreaterThan(50_000);
      expect(state.values.telemetryCostUsdPerMonth as number).toBeGreaterThan(40_000);
    });

    it("path B reduces logging/telemetry cost sharply while leaving dependency cost high", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, TELEMETRY_FIX_ACTIONS);
      expect(state.values.dependencyRequestCostUsdPerMonth as number).toBeGreaterThan(35_000);
      expect(state.values.loggingCostUsdPerMonth).toBe(9_000);
      expect(state.values.telemetryCostUsdPerMonth).toBe(6_000);
    });

    it("neither single-axis alternate strong path alone reaches OPTIMAL — both land at ACCEPTABLE instead", () => {
      const pathA = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, RETRY_FIX_ACTIONS);
      const pathB = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, TELEMETRY_FIX_ACTIONS);
      expect(evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, pathA)).toEqual({
        eligible: true,
        tier: "acceptable",
      });
      expect(evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, pathB)).toEqual({
        eligible: true,
        tier: "acceptable",
      });
    });

    it("both combined reach OPTIMAL with identical recovery/dataIntegrity/reliability, differing honestly on cost deltas", () => {
      const combinedState = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, COMBINED_OPTIMAL_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, combinedState);
      expect(result.completionTier).toBe("optimal");
      const score = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        extractFinishScoringInputs(expensiveRetryAndLoggingAmplificationSimulation, result),
      );
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
    });
  });

  describe("Multi-step path", () => {
    it("step 1 alone (retryCount=1) begins real progress but not yet at the settled partial-progress state", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 4_000, [
        { atMs: SUSTAINED_UNADDRESSED_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 1 },
      ]);
      const eligibility = evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("step 2 on top of step 1 (worker-owns-retries) plus settling reaches real, verified partial progress", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, RETRY_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("retry-amplification-reduced");
    });

    it("step 3 on top of steps 1-2 (engage telemetry-fix levers too) finally reaches OPTIMAL", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, COMBINED_OPTIMAL_ACTIONS);
      expect(state.transitions.incidentState).toBe("cost-optimized-safe");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(DEPLOY_REGRESSION_DETECTED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable even though availability already looks green", () => {
      const state = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 5_000);
      // Availability-looks-green sanity check: this is the exact trap
      // requirement 10 guards against for no-outage/proactive scenarios.
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
      const result = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained neglect still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("declared_unstable still wins in candidate_declared mode even though the engine never auto-fails the attempt", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 6 * 60_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      const result = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).not.toBe("failed");
    });
  });

  describe("Scoring", () => {
    it("optimal path (cost-optimized-safe) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, COMBINED_OPTIMAL_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, state);
      const inputs = extractFinishScoringInputs(expensiveRetryAndLoggingAmplificationSimulation, result);
      const score = scoreAuthoredAttempt(EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
      console.log("OPTIMAL FINAL STATE", JSON.stringify(state.values));
    });

    it("acceptable path (safe-but-wasteful) scores well but below optimal", () => {
      const optimalState = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, COMBINED_OPTIMAL_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(expensiveRetryAndLoggingAmplificationSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        extractFinishScoringInputs(expensiveRetryAndLoggingAmplificationSimulation, optimalResult),
      );

      const acceptableState = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 40_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "standard" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        expensiveRetryAndLoggingAmplificationSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        extractFinishScoringInputs(expensiveRetryAndLoggingAmplificationSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("ACCEPTABLE FINAL STATE", JSON.stringify(acceptableState.values));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit and the full unaddressed dataIntegrity/reliability penalty", () => {
      const state = runScenario(SUSTAINED_UNADDRESSED_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
      console.log("BASELINE FINAL STATE", JSON.stringify(state.values));
    });

    it("harmful path (audit-off) scores worse than baseline on dataIntegrity AND total, despite cost looking better", () => {
      const baselineState = runScenario(SUSTAINED_UNADDRESSED_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_UNADDRESSED_MS + 60_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.costOverrunPercent as number).toBeLessThan(
        baselineState.values.costOverrunPercent as number,
      );
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (audit-off) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("harmful path (audit-off) never wins overall even against the worst safe path", () => {
      const overreachState = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: RETRY_COUNT_KEY, value: 0 },
      ]);
      const harmfulState = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      const overreachScore = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        buildScoringInputs(overreachState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulScore.total).toBeLessThan(overreachScore.total);
    });

    it("the two alternate strong paths score equally well on dataIntegrity/reliability at an equivalent settled window", () => {
      const pathA = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, RETRY_FIX_ACTIONS);
      const pathB = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, TELEMETRY_FIX_ACTIONS);
      const scoreA = scoreAuthoredAttempt(EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING, buildScoringInputs(pathA));
      const scoreB = scoreAuthoredAttempt(EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING, buildScoringInputs(pathB));
      expect(scoreA.breakdown.dataIntegrity).toBe(scoreB.breakdown.dataIntegrity);
      expect(scoreA.breakdown.reliability).toBe(scoreB.breakdown.reliability);
      console.log("PATH A (retry fix) SCORE", JSON.stringify(scoreA));
      console.log("PATH B (telemetry fix) SCORE", JSON.stringify(scoreB));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, COMBINED_OPTIMAL_ACTIONS);
      const runB = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, COMBINED_OPTIMAL_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak audit-blind-window seconds and cost-overrun generically via numericWatchFields", () => {
      const state = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000, [
        { atMs: DEPLOY_REGRESSION_DETECTED_MS + 1_000, controlKey: LOGGING_LEVEL_KEY, value: "off" },
      ]);
      expect(state.peaks.peakValues.cumulativeAuditLogBlindWindowSeconds).toBeGreaterThan(0);
      expect(state.peaks.peakValues.costOverrunPercent).toBeGreaterThan(0);
    });

    it("peak cost-overrun never decreases even after the live value is reduced back down", () => {
      const worst = runScenario(DEPLOY_REGRESSION_DETECTED_MS + 10_000);
      const improved = runScenario(COST_SETTLING_FULLY_DONE_MS + 10_000, COMBINED_OPTIMAL_ACTIONS);
      expect(improved.values.costOverrunPercent).toBe(0);
      expect(improved.peaks.peakValues.costOverrunPercent as number).toBeGreaterThanOrEqual(
        worst.values.costOverrunPercent as number,
      );
    });
  });

  // Sanity checks referencing imported but not-yet-directly-asserted
  // timeline constants, keeping the timeline import set honest.
  describe("Timeline anchors", () => {
    it("COST_SETTLING_WINDOW_1_MS sits strictly between SUSTAINED_UNADDRESSED_MS and COST_SETTLING_FULLY_DONE_MS", () => {
      expect(COST_SETTLING_WINDOW_1_MS).toBeGreaterThan(SUSTAINED_UNADDRESSED_MS);
      expect(COST_SETTLING_WINDOW_1_MS).toBeLessThan(COST_SETTLING_FULLY_DONE_MS);
    });
  });

  describe("dependencyBackoff and retentionMode are real, non-dead secondary accelerant controls", () => {
    it("exponential backoff on top of path A reaches a distinct, strictly-better sub-state (higher requestSuccessRate)", () => {
      const withoutBackoff = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, RETRY_FIX_ACTIONS);
      const withBackoff = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, [
        ...RETRY_FIX_ACTIONS,
        { atMs: SUSTAINED_UNADDRESSED_MS + 3_000, controlKey: DEPENDENCY_BACKOFF_KEY, value: "exponential" },
      ]);
      expect(withoutBackoff.transitions.incidentState).toBe("retry-amplification-reduced");
      expect(withBackoff.transitions.incidentState).toBe("retry-amplification-reduced-backoff");
      expect(withBackoff.values.requestSuccessRate as number).toBeGreaterThan(
        withoutBackoff.values.requestSuccessRate as number,
      );
      // Same cost-overrun progress on this axis — backoff smooths peak
      // request pressure, it does not itself change retried volume.
      expect(withBackoff.values.costOverrunPercent).toBe(withoutBackoff.values.costOverrunPercent);
      expect(withBackoff.controlValues[DEPENDENCY_BACKOFF_KEY]).toBe("exponential");
    });

    it("tiered retention on top of path B reaches a distinct, strictly-cheaper sub-state (lower loggingCost)", () => {
      const withoutTiering = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, TELEMETRY_FIX_ACTIONS);
      const withTiering = runScenario(COST_SETTLING_FULLY_DONE_MS + 5_000, [
        ...TELEMETRY_FIX_ACTIONS,
        { atMs: SUSTAINED_UNADDRESSED_MS + 4_000, controlKey: RETENTION_MODE_KEY, value: "tiered" },
      ]);
      expect(withoutTiering.transitions.incidentState).toBe("telemetry-noise-reduced");
      expect(withTiering.transitions.incidentState).toBe("telemetry-noise-reduced-tiered");
      expect(withTiering.values.loggingCostUsdPerMonth as number).toBeLessThan(
        withoutTiering.values.loggingCostUsdPerMonth as number,
      );
      expect(withTiering.values.costOverrunPercent as number).toBeLessThan(
        withoutTiering.values.costOverrunPercent as number,
      );
      expect(withTiering.controlValues[RETENTION_MODE_KEY]).toBe("tiered");
    });

    it("both sub-variants remain fully safe (audit intact) and still only reach ACCEPTABLE, never OPTIMAL alone", () => {
      const withBackoff = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, [
        ...RETRY_FIX_ACTIONS,
        { atMs: SUSTAINED_UNADDRESSED_MS + 3_000, controlKey: DEPENDENCY_BACKOFF_KEY, value: "exponential" },
      ]);
      const withTiering = runScenario(COST_SETTLING_FULLY_DONE_MS + 35_000, [
        ...TELEMETRY_FIX_ACTIONS,
        { atMs: SUSTAINED_UNADDRESSED_MS + 4_000, controlKey: RETENTION_MODE_KEY, value: "tiered" },
      ]);
      expect(withBackoff.values.auditLogIntegrityStatus).toBe("intact");
      expect(withTiering.values.auditLogIntegrityStatus).toBe("intact");
      expect(evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, withBackoff)).toEqual({
        eligible: true,
        tier: "acceptable",
      });
      expect(evaluateCompletionEligibility(expensiveRetryAndLoggingAmplificationSimulation, withTiering)).toEqual({
        eligible: true,
        tier: "acceptable",
      });
    });
  });
});
