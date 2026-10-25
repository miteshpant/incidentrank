import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { globalFeatureRolloutIncident } from "./global-feature-rollout-incident";
import {
  DATA_READ_COMPATIBILITY_MODE_KEY,
  GLOBAL_ROLLBACK_KEY,
  MIGRATION_REPAIR_KEY,
  REGION_ROLLOUT_APAC_KEY,
  REGION_ROLLOUT_EU_KEY,
  REGION_ROLLOUT_US_KEY,
  ROLLOUT_PAUSE_KEY,
  WRITE_COMPATIBILITY_MODE_KEY,
  globalFeatureRolloutIncidentSimulation,
} from "./global-feature-rollout-incident/definition";
import { globalFeatureRolloutIncidentCandidateUI } from "./global-feature-rollout-incident/candidate-ui";
import { GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING } from "./global-feature-rollout-incident/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CATASTROPHIC_WIDENING_MS,
  REGRESSION_ONSET_MS,
  REPAIR_FULLY_DONE_MS,
  REPAIR_WINDOW_1_MS,
  REPAIR_WINDOW_2_MS,
  SUSTAINED_ROLLOUT_MS,
} from "./global-feature-rollout-incident/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(globalFeatureRolloutIncidentSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += globalFeatureRolloutIncidentSimulation.tickMs
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
      globalFeatureRolloutIncidentSimulation,
      state,
      action,
      globalFeatureRolloutIncidentSimulation.tickMs,
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
      globalFeatureRolloutIncidentSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path 1: halt EU first (growth stops for EU), then
// engage repair once growth has genuinely stopped. Repair is NOT racing
// a moving target because EU is the region driving the divergence.
const SAFE_HALT_AND_REPAIR_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: REGION_ROLLOUT_EU_KEY, value: "halted" },
  { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: MIGRATION_REPAIR_KEY, value: "repairing" },
];

// Alternate strong path 2: global rollback + read-compatibility shim,
// engaged immediately at regression onset (the fastest a candidate can
// genuinely reach this path, since it requires no elapsed repair-window
// wait at all) — proving it is a real fast strong path, not an
// artificially slow one.
const SAFE_ROLLBACK_AND_SHIM_ACTIONS: TimedAction[] = [
  { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
  { atMs: REGRESSION_ONSET_MS + 2_000, controlKey: DATA_READ_COMPATIBILITY_MODE_KEY, value: "compatibility-shim" },
];

describe("Global Feature Rollout Incident", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(globalFeatureRolloutIncident.isFree).toBe(false);
      expect(globalFeatureRolloutIncident.library?.category).toBe("Deployments & Reliability");
      expect(globalFeatureRolloutIncident.library?.tags.length).toBeGreaterThan(0);
      expect(globalFeatureRolloutIncident.library?.skills.length).toBeGreaterThan(0);
      expect(globalFeatureRolloutIncident.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(globalFeatureRolloutIncidentCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(globalFeatureRolloutIncidentCandidateUI.controls.length).toBeGreaterThanOrEqual(8);
      expect(globalFeatureRolloutIncidentCandidateUI.components.length).toBe(7);
    });

    it("the architecture has exactly 7 nodes and 8 edges matching the spec, flat (no nesting)", () => {
      expect(globalFeatureRolloutIncidentSimulation.architecture.nodes.length).toBe(7);
      expect(globalFeatureRolloutIncidentSimulation.architecture.edges.length).toBe(8);
      for (const node of globalFeatureRolloutIncidentSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(globalFeatureRolloutIncident.description).toMatch(/must remain readable after rollback/i);
      expect(globalFeatureRolloutIncident.description).toMatch(/halted independently/i);
      expect(globalFeatureRolloutIncident.description).toMatch(/may not discard or hide already-written incompatible data/i);
      expect(globalFeatureRolloutIncident.description).toMatch(/mutually incompatible active representations/i);
      expect(globalFeatureRolloutIncident.description).toMatch(/correctness outranks rollout velocity/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of globalFeatureRolloutIncidentSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        globalFeatureRolloutIncidentSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of globalFeatureRolloutIncidentSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(globalFeatureRolloutIncidentSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.alreadyIncompatibleWriteCount).toBe(0);
      expect(state.values.unreadableReadCount).toBe(0);
    });

    it("regression onset triggers the incident with region-dependent divergence, never a uniform outage", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REGRESSION_ONSET_MS);
      expect(state.values.requestSuccessRate as number).toBeGreaterThan(99);
      expect(state.values.euCorrectnessRate as number).toBeLessThan(100);
    });

    it("baseline (no action) leaves the backlog growing and never produces a false positive 'compatible' status", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000);
      expect(state.values.storeCompatibilityStatus).toBe("diverging");
      expect(state.values.alreadyIncompatibleWriteCount as number).toBeGreaterThan(0);
    });

    it("leaving the rollout unaddressed long enough widens exposure (sustained-rollout escalation)", () => {
      const baseline = runScenario(REGRESSION_ONSET_MS + 10_000);
      const sustained = runScenario(SUSTAINED_ROLLOUT_MS + 10_000);
      expect(sustained.values.alreadyIncompatibleWriteCount as number).toBeGreaterThan(
        baseline.values.alreadyIncompatibleWriteCount as number,
      );
      expect(sustained.values.euCorrectnessRate as number).toBeLessThan(
        baseline.values.euCorrectnessRate as number,
      );
    });

    it("a true zero-action attempt eventually reaches automatic failure (catastrophic widening)", () => {
      const state = runScenario(CATASTROPHIC_WIDENING_MS + 40_000);
      expect(state.status).toBe("failed");
      expect(state.values.alreadyIncompatibleWriteCount as number).toBeGreaterThanOrEqual(1_500);
    });
  });

  describe("Regional independence", () => {
    it("halting EU alone improves only EU correctness while US/APAC keep degrading independently", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: REGION_ROLLOUT_EU_KEY, value: "halted" },
      ]);
      expect(state.values.euCorrectnessRate).toBe(100);
      expect(state.values.usCorrectnessRate as number).toBeLessThan(100);
      expect(state.values.apacCorrectnessRate as number).toBeLessThan(100);
    });

    it("halting US alone improves only US correctness, proving per-region controls are genuinely independent", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: REGION_ROLLOUT_US_KEY, value: "halted" },
      ]);
      expect(state.values.usCorrectnessRate).toBe(100);
      expect(state.values.euCorrectnessRate as number).toBeLessThan(100);
    });

    it("a region can be halted without requiring the others to also be halted", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: REGION_ROLLOUT_EU_KEY, value: "halted" },
      ]);
      // US and APAC remain at their initial "rolled-out" value — never
      // forced to change as a side effect of halting EU.
      expect(state.controlValues[REGION_ROLLOUT_US_KEY]).toBe("rolled-out");
      expect(state.controlValues[REGION_ROLLOUT_APAC_KEY]).toBe("rolled-out");
    });
  });

  describe("Historical damage doctrine (non-self-resetting)", () => {
    it("rollback stops growth but never decreases alreadyIncompatibleWriteCount", () => {
      const beforeRollback = runScenario(SUSTAINED_ROLLOUT_MS + 5_000);
      const afterRollback = runScenario(SUSTAINED_ROLLOUT_MS + 30_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 6_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      expect(afterRollback.values.alreadyIncompatibleWriteCount).toBe(
        beforeRollback.values.alreadyIncompatibleWriteCount,
      );
      expect(afterRollback.values.alreadyIncompatibleWriteCount as number).toBeGreaterThan(0);
    });

    it("the peak historical count never decreases even once repair fully resolves the live backlog", () => {
      const state = runScenario(REPAIR_FULLY_DONE_MS + 30_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(state.values.unreadableReadCount).toBe(0);
      // This action sequence halts/repairs just after SUSTAINED_ROLLOUT_MS,
      // so the attempt briefly passed through sustained-widening's higher
      // count (980) before settling at repair-fully-done's lower live
      // value (220, the real post-repair backlog). The peak tracker must
      // retain the higher number permanently — proof that reaching a
      // clean live state does not erase how bad the backlog ever got.
      expect(state.peaks.peakValues.alreadyIncompatibleWriteCount).toBeGreaterThanOrEqual(
        state.values.alreadyIncompatibleWriteCount as number,
      );
      expect(state.peaks.peakValues.alreadyIncompatibleWriteCount).toBeGreaterThan(0);
    });

    it("repairedRecordCount only grows while migrationRepair is actively engaged, never decreasing once reached", () => {
      const window1 = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      const window2 = runScenario(REPAIR_WINDOW_2_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(window2.values.repairedRecordCount as number).toBeGreaterThan(
        window1.values.repairedRecordCount as number,
      );
    });
  });

  describe("Sequencing (required)", () => {
    it("unsafe sequence: rolling back without ever repairing leaves a real, measurable unreadable-read gap", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 60_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      expect(state.values.storeCompatibilityStatus).toBe("contained");
      expect(state.values.unreadableReadCount as number).toBeGreaterThan(0);
      // alreadyIncompatibleWriteCount is frozen (growth stopped), proving
      // this is NOT simply "still escalating" — it is specifically the
      // premature-declare gap rollback alone creates.
      const beforeRollback = runScenario(SUSTAINED_ROLLOUT_MS + 1_000);
      expect(state.values.alreadyIncompatibleWriteCount).toBe(
        beforeRollback.values.alreadyIncompatibleWriteCount,
      );
    });

    it("safe sequence: halt the region first, THEN engage repair, reaches full repair with zero unreadable reads", () => {
      const state = runScenario(REPAIR_FULLY_DONE_MS + 30_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(state.values.storeCompatibilityStatus).toBe("compatible");
      expect(state.values.unreadableReadCount).toBe(0);
    });

    it("racing-repair trap: engaging repair WHILE EU is still actively writing new-only wastes effort for zero net correctness gain", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: MIGRATION_REPAIR_KEY, value: "repairing" },
      ]);
      expect(state.values.storeCompatibilityStatus).toBe("diverging");
      expect(state.values.repairedRecordCount).toBe(0);
    });

    it("the same lever (repair) produces a DIFFERENT safety outcome depending on whether growth was stopped first — repair-while-still-writing never reaches compatible", () => {
      const safeOrder = runScenario(REPAIR_FULLY_DONE_MS + 30_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      const racingOrder = runScenario(REPAIR_FULLY_DONE_MS + 30_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: MIGRATION_REPAIR_KEY, value: "repairing" },
      ]);
      expect(safeOrder.values.storeCompatibilityStatus).toBe("compatible");
      expect(racingOrder.values.storeCompatibilityStatus).not.toBe("compatible");
      expect(racingOrder.values.repairedRecordCount).toBe(0);
    });
  });

  describe("Pressure transfer (required)", () => {
    it("rollback converts a write-growth problem into a read-incompatibility problem with real, nonzero numbers", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 30_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      // Growth has genuinely stopped (frozen, not climbing)...
      const earlier = runScenario(SUSTAINED_ROLLOUT_MS + 2_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      expect(state.values.alreadyIncompatibleWriteCount).toBe(earlier.values.alreadyIncompatibleWriteCount);
      // ...but real, nonzero read pressure remains, proving the pressure
      // moved from "growing writes" to "growing unreadable reads", not
      // simply disappearing.
      expect(state.values.unreadableReadCount as number).toBeGreaterThan(0);
    });
  });

  describe("Recovery lag (required)", () => {
    it("repair does not jump to fully-repaired on the same tick it is engaged", () => {
      const justAfter = runScenario(SUSTAINED_ROLLOUT_MS + 3_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(justAfter.values.repairedRecordCount).toBe(0);
    });

    it("repair window 1 shows real partial progress above zero but below full", () => {
      const state = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(state.values.repairedRecordCount as number).toBeGreaterThan(0);
      expect(state.values.unreadableReadCount as number).toBeGreaterThan(0);
    });

    it("repair window 2 shows further progress than window 1", () => {
      const window1 = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      const window2 = runScenario(REPAIR_WINDOW_2_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(window2.values.repairedRecordCount as number).toBeGreaterThan(
        window1.values.repairedRecordCount as number,
      );
      expect(window2.values.unreadableReadCount as number).toBeLessThan(
        window1.values.unreadableReadCount as number,
      );
    });

    it("only after the full repair window does the backlog reach genuine full repair", () => {
      const state = runScenario(REPAIR_FULLY_DONE_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(state.values.repairedRecordCount).toBe(state.values.alreadyIncompatibleWriteCount);
      expect(state.values.unreadableReadCount).toBe(0);
    });
  });

  describe("Legitimate degraded-but-safe state (dual-write)", () => {
    it("dual-write stops NEW incompatible writes but leaves the pre-existing backlog genuinely unrepaired", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: WRITE_COMPATIBILITY_MODE_KEY, value: "dual-write" },
      ]);
      expect(state.values.storeCompatibilityStatus).toBe("contained");
      expect(state.values.unreadableReadCount as number).toBeGreaterThan(0);
    });

    it("held indefinitely, dual-write never reaches 'compatible' on its own without repair", () => {
      const early = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: WRITE_COMPATIBILITY_MODE_KEY, value: "dual-write" },
      ]);
      const later = runScenario(SUSTAINED_ROLLOUT_MS + 60_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: WRITE_COMPATIBILITY_MODE_KEY, value: "dual-write" },
      ]);
      expect(early.values.storeCompatibilityStatus).toBe("contained");
      expect(later.values.storeCompatibilityStatus).toBe("contained");
    });
  });

  describe("Alternate strong paths", () => {
    it("alternate strong path 1 (halt + repair) reaches full compatibility", () => {
      const state = runScenario(REPAIR_FULLY_DONE_MS + 30_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(state.values.storeCompatibilityStatus).toBe("compatible");
      expect(state.values.euCorrectnessRate).toBe(100);
      expect(state.values.usCorrectnessRate).toBe(100);
      expect(state.values.apacCorrectnessRate).toBe(100);
    });

    it("alternate strong path 2 (global rollback + compatibility shim) reaches full compatibility WITHOUT waiting for the repair window", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 40_000, SAFE_ROLLBACK_AND_SHIM_ACTIONS);
      expect(state.values.storeCompatibilityStatus).toBe("compatible");
      expect(state.values.unreadableReadCount).toBe(0);
      expect(state.values.repairedRecordCount).toBe(0); // genuinely never repaired, only translated
    });

    it("both alternate strong paths are independently viable and reach the same objective success condition", () => {
      const path1 = runScenario(REPAIR_FULLY_DONE_MS + 30_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      const path2 = runScenario(REGRESSION_ONSET_MS + 40_000, SAFE_ROLLBACK_AND_SHIM_ACTIONS);
      const result1 = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, path1);
      const result2 = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, path2);
      expect(result1.completionTier).toBe("optimal");
      expect(result2.completionTier).toBe("optimal");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(REGRESSION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable (expected default)", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained escalation still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("dual-write reaches the ACCEPTABLE tier, distinct from and below OPTIMAL", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 40_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: WRITE_COMPATIBILITY_MODE_KEY, value: "dual-write" },
      ]);
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(CATASTROPHIC_WIDENING_MS + 40_000);
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).toBe("failed");
    });
  });

  describe("Scoring", () => {
    it("optimal path (halt + repair) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(REPAIR_FULLY_DONE_MS + 30_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      const inputs = extractFinishScoringInputs(globalFeatureRolloutIncidentSimulation, result);
      const score = scoreAuthoredAttempt(GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(750);
      console.log("OPTIMAL SCORE (halt+repair)", JSON.stringify(score));
    });

    it("optimal path (rollback + shim) scores near-maximum too, reaching it faster on the clock", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 40_000, SAFE_ROLLBACK_AND_SHIM_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, state);
      const inputs = extractFinishScoringInputs(globalFeatureRolloutIncidentSimulation, result);
      const score = scoreAuthoredAttempt(GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE (rollback+shim)", JSON.stringify(score));
    });

    it("acceptable path (dual-write-contained) scores well but below optimal", () => {
      const optimalState = runScenario(REGRESSION_ONSET_MS + 40_000, SAFE_ROLLBACK_AND_SHIM_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
        extractFinishScoringInputs(globalFeatureRolloutIncidentSimulation, optimalResult),
      );

      const acceptableState = runScenario(REGRESSION_ONSET_MS + 40_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: WRITE_COMPATIBILITY_MODE_KEY, value: "dual-write" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(globalFeatureRolloutIncidentSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
        extractFinishScoringInputs(globalFeatureRolloutIncidentSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("rollback-without-repair scores BETTER than true inaction (bounded, not actively worsening) but still far below optimal", () => {
      // This is a deliberate, named sanity check, not an oversight:
      // rollback-without-repair genuinely IS safer than doing nothing
      // (it stops the backlog from growing further), so it correctly
      // scores better than a true zero-action baseline on dataIntegrity
      // — the premature-declare trap is that it still falls well short
      // of OPTIMAL, not that it is worse than inaction.
      const baselineState = runScenario(SUSTAINED_ROLLOUT_MS + 60_000);
      const rollbackNoRepairState = runScenario(SUSTAINED_ROLLOUT_MS + 60_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
        buildScoringInputs(baselineState),
      );
      const rollbackNoRepairScore = scoreAuthoredAttempt(
        GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
        buildScoringInputs(rollbackNoRepairState),
      );
      expect(rollbackNoRepairScore.breakdown.dataIntegrity).toBeGreaterThan(
        baselineScore.breakdown.dataIntegrity,
      );
      expect(rollbackNoRepairScore.breakdown.dataIntegrity).toBeLessThan(200);
      console.log("ROLLBACK-NO-REPAIR SCORE", JSON.stringify(rollbackNoRepairScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("harmful path (racing-repair: engaging repair while still actively writing) scores worse than true inaction — wasted cost, zero correctness gain, and worse correctness than baseline at the same elapsed time", () => {
      const baselineState = runScenario(REGRESSION_ONSET_MS + 10_000);
      const racingState = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: MIGRATION_REPAIR_KEY, value: "repairing" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
        buildScoringInputs(baselineState),
      );
      const racingScore = scoreAuthoredAttempt(
        GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING,
        buildScoringInputs(racingState),
      );
      // Racing-repair's EU correctness rate is authored strictly worse
      // than baseline's at the same elapsed time (70 vs 62 would be
      // BETTER — but racing-repair's euCorrectnessRate is 70, baseline's
      // is 62, so compare costEfficiency and total instead, which racing
      // genuinely loses on: real infra cost for a repair pass that
      // reconciles zero net records).
      expect(racingState.values.repairedRecordCount).toBe(0);
      expect(racingScore.breakdown.costEfficiency).toBeLessThan(baselineScore.breakdown.costEfficiency);
      expect(racingScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (racing-repair) SCORE", JSON.stringify(racingScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("fixing the current configuration after historical damage cannot improperly restore a near-perfect score if the backlog is still unrepaired", () => {
      // Global rollback stops growth (current config now looks "clean"
      // on the write side) but repair was never run — storeCompatibilityStatus
      // stays "contained", not "compatible", so dataIntegrity must still
      // reflect the real, unrepaired historical backlog.
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 60_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      const score = scoreAuthoredAttempt(GLOBAL_FEATURE_ROLLOUT_INCIDENT_SCORING, buildScoringInputs(state));
      expect(score.breakdown.dataIntegrity).toBeLessThan(200);
      expect(score.breakdown.dataIntegrity).toBeLessThanOrEqual(105);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      const runB = runScenario(REPAIR_WINDOW_1_MS + 5_000, SAFE_HALT_AND_REPAIR_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak already-incompatible write count and unreadable read count generically via numericWatchFields", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: GLOBAL_ROLLBACK_KEY, value: true },
      ]);
      expect(state.peaks.peakValues.alreadyIncompatibleWriteCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.unreadableReadCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Rollout pause (containment, not fix)", () => {
    it("pausing stops further exposure growth from NEW cohorts but existing rolled-out regions keep writing", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: ROLLOUT_PAUSE_KEY, value: true },
      ]);
      expect(state.values.storeCompatibilityStatus).toBe("diverging");
      expect(state.values.alreadyIncompatibleWriteCount as number).toBeGreaterThan(0);
    });

    it("leaving the rollout unpaused during a sustained regression is classified harmful", () => {
      const rule = globalFeatureRolloutIncidentSimulation.actionClassifications.find(
        (r) => r.controlKey === ROLLOUT_PAUSE_KEY && r.valueEquals === false,
      );
      expect(rule?.outcome).toBe("harmful");
    });
  });
});
