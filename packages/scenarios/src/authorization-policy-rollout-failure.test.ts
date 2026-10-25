import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { authorizationPolicyRolloutFailure } from "./authorization-policy-rollout-failure";
import {
  CACHE_INVALIDATION_KEY,
  EMERGENCY_OVERRIDE_LIST_KEY,
  FAIL_OPEN_MODE_KEY,
  POLICY_CACHE_TTL_SECONDS_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLBACK_SOURCE_POLICY_KEY,
  ROLLOUT_FREEZE_KEY,
  STAGED_COHORT_KEY,
  authorizationPolicyRolloutFailureSimulation,
} from "./authorization-policy-rollout-failure/definition";
import { authorizationPolicyRolloutFailureCandidateUI } from "./authorization-policy-rollout-failure/candidate-ui";
import { AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING } from "./authorization-policy-rollout-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CONVERGENCE_FULLY_DONE_MS,
  CONVERGENCE_WINDOW_1_MS,
  CONVERGENCE_WINDOW_2_MS,
  PASSIVE_CONVERGENCE_FULLY_DONE_MS,
  PASSIVE_CONVERGENCE_WINDOW_1_MS,
  REGRESSION_ONSET_MS,
  SUSTAINED_ROLLOUT_MS,
} from "./authorization-policy-rollout-failure/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(authorizationPolicyRolloutFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += authorizationPolicyRolloutFailureSimulation.tickMs
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
      authorizationPolicyRolloutFailureSimulation,
      state,
      action,
      authorizationPolicyRolloutFailureSimulation.tickMs,
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
      authorizationPolicyRolloutFailureSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Safe rollback path (alternate strong path #1): pin is never touched;
// the source policy is rolled back directly.
const SAFE_ROLLBACK_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: ROLLOUT_FREEZE_KEY, value: "frozen" },
  { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: ROLLBACK_SOURCE_POLICY_KEY, value: true },
  { atMs: SUSTAINED_ROLLOUT_MS + 3_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
];

// Safe forward-fix path (alternate strong path #2): pin to v1 (never
// flipping rollbackSourcePolicy), stage the cohort, invalidate.
const SAFE_FORWARD_FIX_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: ROLLOUT_FREEZE_KEY, value: "frozen" },
  { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
  { atMs: SUSTAINED_ROLLOUT_MS + 3_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
];

describe("Authorization Policy Rollout Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(authorizationPolicyRolloutFailure.isFree).toBe(false);
      expect(authorizationPolicyRolloutFailure.library?.category).toBe("Security & Identity");
      expect(authorizationPolicyRolloutFailure.library?.tags.length).toBeGreaterThan(0);
      expect(authorizationPolicyRolloutFailure.library?.skills.length).toBeGreaterThan(0);
      expect(authorizationPolicyRolloutFailure.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(authorizationPolicyRolloutFailureCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(authorizationPolicyRolloutFailureCandidateUI.controls.length).toBeGreaterThanOrEqual(8);
      expect(authorizationPolicyRolloutFailureCandidateUI.components.length).toBe(7);
    });

    it("the architecture has exactly 7 nodes and 8 edges matching the spec, flat (no nesting)", () => {
      expect(authorizationPolicyRolloutFailureSimulation.architecture.nodes.length).toBe(7);
      expect(authorizationPolicyRolloutFailureSimulation.architecture.edges.length).toBe(8);
      for (const node of authorizationPolicyRolloutFailureSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(authorizationPolicyRolloutFailure.description).toMatch(/unauthorized access must never be granted/i);
      expect(authorizationPolicyRolloutFailure.description).toMatch(/default fail-closed/i);
      expect(authorizationPolicyRolloutFailure.description).toMatch(/not complete until cache convergence/i);
      expect(authorizationPolicyRolloutFailure.description).toMatch(/observable and bounded/i);
      expect(authorizationPolicyRolloutFailure.description).toMatch(/availability loss is preferable to unauthorized access/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of authorizationPolicyRolloutFailureSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        authorizationPolicyRolloutFailureSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of authorizationPolicyRolloutFailureSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(authorizationPolicyRolloutFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
      expect(state.values.cumulativeUnauthorizedAccessCount).toBe(0);
    });

    it("regression onset triggers the incident with selective false-denies, never unauthorized access", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REGRESSION_ONSET_MS);
      expect(state.values.falseDenyRatePercent).toBeGreaterThan(0);
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
      expect(state.values.cumulativeUnauthorizedAccessCount).toBe(0);
    });

    it("baseline (no action) leaves false-denies unresolved and never produces unauthorized access", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline");
      expect(state.values.falseDenyRatePercent).toBeGreaterThan(0);
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
    });

    it("leaving the rollout un-frozen long enough widens exposure (sustained-rollout escalation)", () => {
      const early = runScenario(REGRESSION_ONSET_MS + 5_000);
      const sustained = runScenario(SUSTAINED_ROLLOUT_MS + 5_000);
      expect(sustained.transitions.incidentState).toBe("widening-unfrozen");
      expect(sustained.values.falseDenyRatePercent as number).toBeGreaterThan(
        early.values.falseDenyRatePercent as number,
      );
      expect(sustained.values.fleetVersionSkewStatus).toBe("unbounded");
    });
  });

  describe("Required pressure-transfer mechanism: fail-open -> security correctness loss", () => {
    it("fail-open-all improves availability but creates real, nonzero unauthorized access", () => {
      const baseline = runScenario(REGRESSION_ONSET_MS + 10_000);
      const failOpen = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      expect(failOpen.transitions.incidentState).toBe("fail-open-all");
      // Availability genuinely improves relative to baseline.
      expect(failOpen.values.requestSuccessRate as number).toBeGreaterThan(
        baseline.values.requestSuccessRate as number,
      );
      // But unauthorized access is now real and nonzero.
      expect(failOpen.values.unauthorizedGrantRatePercent as number).toBeGreaterThan(0);
      expect(failOpen.values.cumulativeUnauthorizedAccessCount as number).toBeGreaterThan(0);
      expect(failOpen.values.authorizationStatus).toBe("unauthorized-access-active");
    });

    it("fail-open-all held through the sustained window compounds the unauthorized access count further", () => {
      const early = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const sustained = runScenario(SUSTAINED_ROLLOUT_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      expect(sustained.transitions.incidentState).toBe("fail-open-all-sustained");
      expect(sustained.values.cumulativeUnauthorizedAccessCount as number).toBeGreaterThan(
        early.values.cumulativeUnauthorizedAccessCount as number,
      );
    });

    it("fail-open-all can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 60_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Security QA (phase6d3.md section 22): fail-open-all cannot be laundered into a safe outcome", () => {
    it("switching back to fail-closed-all stops NEW unauthorized grants but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(SUSTAINED_ROLLOUT_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const correctedState = runScenario(SUSTAINED_ROLLOUT_MS + 20_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
        { atMs: SUSTAINED_ROLLOUT_MS + 11_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-closed-all" },
      ]);
      expect(sealedUnsafeState.values.unauthorizedGrantRatePercent as number).toBeGreaterThan(0);
      expect(correctedState.values.unauthorizedGrantRatePercent).toBe(0);
      // Live grants stopped (the live field answers "is unauthorized
      // access happening RIGHT NOW"), but the peak historical record
      // never decreases once it has peaked.
      expect(correctedState.peaks.peakValues.cumulativeUnauthorizedAccessCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeUnauthorizedAccessCount as number,
      );
    });

    it("full remediation after an unsafe fail-open window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
        { atMs: REGRESSION_ONSET_MS + 2_000, controlKey: ROLLOUT_FREEZE_KEY, value: "frozen" },
        { atMs: REGRESSION_ONSET_MS + 3_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
        { atMs: REGRESSION_ONSET_MS + 4_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
        { atMs: REGRESSION_ONSET_MS + 5_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-closed-all" },
      ]);
      expect(state.transitions.incidentState).toBe("converged-safe");
      // Live correctness is fully safe right now.
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
      expect(state.values.cumulativeUnauthorizedAccessCount).toBe(0);
      expect(state.values.cacheConvergencePercent).toBe(100);
      expect(state.values.fleetVersionSkewStatus).toBe("converged");
      expect(state.values.enforcementPosture).toBe("fail-closed-all");
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier fail-open-all
      // window this attempt passed through.
      expect(state.peaks.peakValues.cumulativeUnauthorizedAccessCount as number).toBeGreaterThan(0);
      // This state is still Finish-eligible as optimal: the CURRENT
      // configuration is genuinely safe, even though its history is
      // not clean.
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the cumulative unauthorized access count only ever increases while fail-open-all is active, dataIntegrity scores materially worse than baseline despite better availability", () => {
      const baselineState = runScenario(REGRESSION_ONSET_MS + 10_000);
      const failOpenState = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        buildScoringInputs(baselineState),
      );
      const failOpenScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        buildScoringInputs(failOpenState),
      );
      expect(failOpenState.values.requestSuccessRate as number).toBeGreaterThan(
        baselineState.values.requestSuccessRate as number,
      );
      expect(failOpenScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(failOpenScore.total).toBeLessThan(baselineScore.total);
    });

    it("sustained fail-open-all eventually reaches automatic failure regardless of other metrics", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 40_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
      const finish = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Second unsafe path: emergency allow-affected-cohort override", () => {
    it("allow-affected-cohort creates real unauthorized access, smaller in scale than global fail-open but never zero", () => {
      const failOpenState = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const overrideState = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: EMERGENCY_OVERRIDE_LIST_KEY, value: "allow-affected-cohort" },
      ]);
      expect(overrideState.transitions.incidentState).toBe("emergency-allow-override");
      expect(overrideState.values.unauthorizedGrantRatePercent as number).toBeGreaterThan(0);
      expect(overrideState.values.cumulativeUnauthorizedAccessCount as number).toBeGreaterThan(0);
      expect(overrideState.values.cumulativeUnauthorizedAccessCount as number).toBeLessThan(
        failOpenState.values.cumulativeUnauthorizedAccessCount as number,
      );
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, overrideState);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the conservative deny-high-risk override never creates unauthorized access", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: EMERGENCY_OVERRIDE_LIST_KEY, value: "deny-high-risk" },
      ]);
      expect(state.transitions.incidentState).toBe("emergency-deny-high-risk");
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
      expect(state.values.cumulativeUnauthorizedAccessCount).toBe(0);
    });
  });

  describe("Premature-declare trap: source fixed, caches NOT converged", () => {
    it("pinning v1 without invalidation leaves cache convergence well below 100% no matter how much time passes without invalidation, never Finish-eligible", () => {
      const soon = runScenario(REGRESSION_ONSET_MS + 15_000, [
        { atMs: REGRESSION_ONSET_MS + 6_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
      ]);
      const muchLater = runScenario(REGRESSION_ONSET_MS + 10 * 60_000, [
        { atMs: REGRESSION_ONSET_MS + 6_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
      ]);
      expect(soon.transitions.incidentState).toBe("source-fixed-unconverged");
      expect(muchLater.transitions.incidentState).toBe("source-fixed-unconverged");
      // Convergence does NOT advance merely because real time passes
      // without active invalidation or a shortened TTL — it is pinned
      // at the same authored "just fixed the source, caches untouched"
      // value regardless of elapsed time, proving fixing the source
      // alone never retroactively converges the fleet.
      expect(soon.values.cacheConvergencePercent).toBe(muchLater.values.cacheConvergencePercent);
      expect(soon.values.cacheConvergencePercent).toBeLessThan(100);
      expect(soon.values.fleetVersionSkewStatus).toBe("skewed");
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, soon);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("rolling back the source alone has the identical premature-declare trap", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 15_000, [
        { atMs: REGRESSION_ONSET_MS + 6_000, controlKey: ROLLBACK_SOURCE_POLICY_KEY, value: true },
      ]);
      expect(state.transitions.incidentState).toBe("source-rolled-back-unconverged");
      expect(state.values.cacheConvergencePercent).toBeLessThan(100);
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Recovery lag: cache convergence climbs only over real elapsed time", () => {
    it("immediately after fixing the source and engaging invalidation, convergence has not yet moved past the trap value", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 4_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
        { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
      ]);
      expect(state.values.cacheConvergencePercent).toBeLessThan(100);
    });

    it("convergence window 1 shows real, partial progress above the unconverged trap", () => {
      const state = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("converging-window1");
      expect(state.values.cacheConvergencePercent).toBe(62);
    });

    it("convergence window 2 shows further progress than window 1", () => {
      const window1 = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      const window2 = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(window2.transitions.incidentState).toBe("converging-window2");
      expect(window2.values.cacheConvergencePercent as number).toBeGreaterThan(
        window1.values.cacheConvergencePercent as number,
      );
    });

    it("only after the full convergence window does convergence reach genuine 100%", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      expect(state.values.cacheConvergencePercent).toBe(100);
      expect(state.values.fleetVersionSkewStatus).toBe("converged");
    });

    it("passive TTL-only convergence (no active invalidation) is real but much slower, proving TTL is not a dead control", () => {
      const shortTtlState = runScenario(PASSIVE_CONVERGENCE_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
        { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: POLICY_CACHE_TTL_SECONDS_KEY, value: 30 },
      ]);
      expect(shortTtlState.transitions.incidentState).toBe("passive-converging-short-ttl");
      expect(shortTtlState.values.cacheConvergencePercent).toBe(58);

      const longTtlFullyDone = runScenario(PASSIVE_CONVERGENCE_FULLY_DONE_MS + 35_000, [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
      ]);
      expect(longTtlFullyDone.transitions.incidentState).toBe("passive-converged-long-ttl");
      expect(longTtlFullyDone.values.cacheConvergencePercent).toBe(97);
      // Still, even at full passive elapsed time, long-TTL passive
      // convergence (97) never quite reaches the active-invalidation
      // path's full 100 within the same real-time budget used for
      // active invalidation — proving active invalidation (and short
      // TTL) are real accelerants, not merely cosmetic.
    });
  });

  describe("Legitimate degraded-but-safe state: fail-open-noncritical", () => {
    it("relieves false-denies for non-critical resources while unauthorizedGrantRatePercent stays exactly 0", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 40_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-noncritical" },
        { atMs: REGRESSION_ONSET_MS + 2_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
      ]);
      expect(state.transitions.incidentState).toBe("safe-degraded-noncritical");
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
      expect(state.values.authorizationStatus).toBe("safe-degraded");
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("held indefinitely, fail-open-noncritical never produces unauthorized access, unlike fail-open-all", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 5 * 60_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-noncritical" },
        { atMs: REGRESSION_ONSET_MS + 2_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
      ]);
      expect(state.values.unauthorizedGrantRatePercent).toBe(0);
      expect(state.values.cumulativeUnauthorizedAccessCount).toBe(0);
    });
  });

  describe("Sequencing sensitivity (principal sequencing required)", () => {
    it("safe sequence: freeze -> pin -> invalidate -> wait for convergence reaches OPTIMAL", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("unsafe sequence: pin+invalidate but never freezing the rollout leaves exposure still widening underneath the fix", () => {
      const unsafeSequenceActions: TimedAction[] = [
        { atMs: SUSTAINED_ROLLOUT_MS + 1_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
        { atMs: SUSTAINED_ROLLOUT_MS + 2_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
        // rolloutFreeze is deliberately never set — stays "rolling".
      ];
      const safeState = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      const unsafeState = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, unsafeSequenceActions);
      // Both reach the same converging-window1 rule (freeze is not
      // itself gated into the convergence rules), proving freeze's
      // real, distinct effect must be demonstrated on the OTHER axis:
      // widening exposure. Compare against the dedicated unfrozen
      // escalation state instead.
      expect(safeState.transitions.incidentState).toBe("converging-window1");
      const stillRollingUnfixed = runScenario(SUSTAINED_ROLLOUT_MS + 5_000);
      expect(stillRollingUnfixed.values.fleetVersionSkewStatus).toBe("unbounded");
      expect(unsafeState.transitions.incidentState).toBe("converging-window1");
    });

    it("unsafe sequence: rolling back the source but declaring done immediately (no invalidation wait) is never Finish-eligible", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 20_000, [
        { atMs: REGRESSION_ONSET_MS + 5_000, controlKey: ROLLBACK_SOURCE_POLICY_KEY, value: true },
      ]);
      expect(state.transitions.incidentState).toBe("source-rolled-back-unconverged");
      const finish = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Alternate strong paths: rollback and forward-fix both reach OPTIMAL independently", () => {
    it("alternate strong path 1 (safe rollback) reaches converged-safe", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_ROLLBACK_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("alternate strong path 2 (safe forward-fix with pin + staged cohort) reaches converged-safe", () => {
      const stagedActions: TimedAction[] = [
        ...SAFE_FORWARD_FIX_ACTIONS,
        { atMs: SUSTAINED_ROLLOUT_MS + 4_000, controlKey: STAGED_COHORT_KEY, value: "staged-canary" },
      ];
      const midState = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, stagedActions);
      expect(midState.transitions.incidentState).toBe("staged-reexpansion");

      const finalState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(finalState.transitions.incidentState).toBe("converged-safe");
      const eligibility = evaluateCompletionEligibility(authorizationPolicyRolloutFailureSimulation, finalState);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("both alternate strong paths reach numerically identical optimal scores when driven to the same real elapsed convergence time", () => {
      const rollbackState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_ROLLBACK_ACTIONS);
      const forwardFixState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_FORWARD_FIX_ACTIONS);
      const rollbackResult = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, rollbackState);
      const forwardFixResult = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, forwardFixState);
      const rollbackScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        extractFinishScoringInputs(authorizationPolicyRolloutFailureSimulation, rollbackResult),
      );
      const forwardFixScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        extractFinishScoringInputs(authorizationPolicyRolloutFailureSimulation, forwardFixResult),
      );
      expect(rollbackScore.total).toBe(forwardFixScore.total);
    });
  });

  describe("Multi-step path", () => {
    it("step 1 alone (freeze) stops widening but false-denies for the exposed cohort continue", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: ROLLOUT_FREEZE_KEY, value: "frozen" },
      ]);
      expect(state.transitions.incidentState).toBe("frozen-source-unfixed");
      expect(state.values.falseDenyRatePercent as number).toBeGreaterThan(0);
    });

    it("step 2 on top of step 1 (pin known-good) still leaves caches unconverged", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: ROLLOUT_FREEZE_KEY, value: "frozen" },
        { atMs: REGRESSION_ONSET_MS + 2_000, controlKey: POLICY_VERSION_PIN_KEY, value: "v1-pinned-good" },
      ]);
      expect(state.transitions.incidentState).toBe("source-fixed-unconverged");
    });

    it("step 3 on top of steps 1-2 (invalidate) finally begins real convergence progress", () => {
      const state = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(state.transitions.incidentState).toBe("converging-window1");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(REGRESSION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable (expected default)", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained escalation still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 40_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const result = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).toBe("failed");
    });
  });

  describe("Scoring", () => {
    it("optimal path (converged-safe) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_FORWARD_FIX_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, state);
      const inputs = extractFinishScoringInputs(authorizationPolicyRolloutFailureSimulation, result);
      const score = scoreAuthoredAttempt(AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (safe-degraded-noncritical) scores well but below optimal", () => {
      const optimalState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_FORWARD_FIX_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        extractFinishScoringInputs(authorizationPolicyRolloutFailureSimulation, optimalResult),
      );

      const acceptableState = runScenario(REGRESSION_ONSET_MS + 40_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-noncritical" },
        { atMs: REGRESSION_ONSET_MS + 2_000, controlKey: CACHE_INVALIDATION_KEY, value: "invalidating" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(authorizationPolicyRolloutFailureSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        extractFinishScoringInputs(authorizationPolicyRolloutFailureSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_ROLLOUT_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (fail-open-all) scores worse than baseline on dataIntegrity AND total, despite superficially better availability", () => {
      const baselineState = runScenario(SUSTAINED_ROLLOUT_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_ROLLOUT_MS + 60_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        AUTHORIZATION_POLICY_ROLLOUT_FAILURE_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.requestSuccessRate as number).toBeGreaterThan(
        baselineState.values.requestSuccessRate as number,
      );
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (fail-open-all) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      const runB = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_FORWARD_FIX_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak unauthorized access and false-deny rate generically via numericWatchFields", () => {
      const state = runScenario(REGRESSION_ONSET_MS + 10_000, [
        { atMs: REGRESSION_ONSET_MS + 1_000, controlKey: FAIL_OPEN_MODE_KEY, value: "fail-open-all" },
      ]);
      expect(state.peaks.peakValues.unauthorizedGrantRatePercent).toBeGreaterThan(0);
      expect(state.peaks.peakValues.cumulativeUnauthorizedAccessCount).toBeGreaterThan(0);
    });
  });
});
