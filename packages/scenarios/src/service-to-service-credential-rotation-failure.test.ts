import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { serviceToServiceCredentialRotationFailure } from "./service-to-service-credential-rotation-failure";
import {
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
  serviceToServiceCredentialRotationFailureSimulation,
} from "./service-to-service-credential-rotation-failure/definition";
import { serviceToServiceCredentialRotationFailureCandidateUI } from "./service-to-service-credential-rotation-failure/candidate-ui";
import { SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING } from "./service-to-service-credential-rotation-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  ROLLBACK_PROPAGATION_FULLY_DONE_MS,
  ROLLBACK_PROPAGATION_WINDOW_1_MS,
  ROTATION_STARTED_MS,
  SUSTAINED_GAP_MS,
} from "./service-to-service-credential-rotation-failure/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(serviceToServiceCredentialRotationFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += serviceToServiceCredentialRotationFailureSimulation.tickMs
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
      serviceToServiceCredentialRotationFailureSimulation,
      state,
      action,
      serviceToServiceCredentialRotationFailureSimulation.tickMs,
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
      serviceToServiceCredentialRotationFailureSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Safe staged-rotation path: activate the new credential, verify every
// cohort while the old credential is still valid, then revoke only
// after full verification.
const SAFE_STAGED_ROTATION_ACTIONS: TimedAction[] = [
  { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
  { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-1-verified" },
  { atMs: ROTATION_STARTED_MS + 3_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-2-verified" },
  { atMs: ROTATION_STARTED_MS + 4_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
  { atMs: ROTATION_STARTED_MS + 5_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
];

// Safe rollback path (alternate strong path): a premature revocation
// gap is created, then deliberately, auditably closed via rollback
// rather than bypass.
const SAFE_ROLLBACK_ACTIONS: TimedAction[] = [
  { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
  { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROLLBACK_OLD_CREDENTIAL_KEY, value: true },
  { atMs: ROTATION_STARTED_MS + 3_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "valid" },
];

describe("Service-to-Service Credential Rotation Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(serviceToServiceCredentialRotationFailure.isFree).toBe(false);
      expect(serviceToServiceCredentialRotationFailure.library?.category).toBe("Security & Identity");
      expect(serviceToServiceCredentialRotationFailure.library?.tags.length).toBeGreaterThan(0);
      expect(serviceToServiceCredentialRotationFailure.library?.skills.length).toBeGreaterThan(0);
      expect(serviceToServiceCredentialRotationFailure.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(serviceToServiceCredentialRotationFailureCandidateUI.metrics.length).toBeGreaterThanOrEqual(6);
      expect(serviceToServiceCredentialRotationFailureCandidateUI.controls.length).toBe(5);
      expect(serviceToServiceCredentialRotationFailureCandidateUI.components.length).toBe(5);
    });

    it("the architecture has exactly 5 nodes and 5 edges matching the spec, flat (no nesting)", () => {
      expect(serviceToServiceCredentialRotationFailureSimulation.architecture.nodes.length).toBe(5);
      expect(serviceToServiceCredentialRotationFailureSimulation.architecture.edges.length).toBe(5);
      for (const node of serviceToServiceCredentialRotationFailureSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all four business invariants and the security invariant", () => {
      expect(serviceToServiceCredentialRotationFailure.description).toMatch(
        /a credential gap must never be bridged by disabling authentication/i,
      );
      expect(serviceToServiceCredentialRotationFailure.description).toMatch(
        /overlap in validity for a bounded window/i,
      );
      expect(serviceToServiceCredentialRotationFailure.description).toMatch(
        /creates a real outage, not just a security exposure/i,
      );
      expect(serviceToServiceCredentialRotationFailure.description).toMatch(
        /rotation cohorts may be staged/i,
      );
      expect(serviceToServiceCredentialRotationFailure.description).toMatch(
        /re-extending validity deliberately and auditably, never bypassing credential validation/i,
      );
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of serviceToServiceCredentialRotationFailureSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        serviceToServiceCredentialRotationFailureSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of serviceToServiceCredentialRotationFailureSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(serviceToServiceCredentialRotationFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(state.values.cumulativeUnauthenticatedCallCount).toBe(0);
    });

    it("rotation start triggers the incident with no gap and no violation yet", () => {
      const state = runScenario(ROTATION_STARTED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(ROTATION_STARTED_MS);
      expect(state.values.serviceToServiceCallSuccessRate).toBeGreaterThan(99);
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(state.values.cumulativeUnauthenticatedCallCount).toBe(0);
    });

    it("baseline (no action) leaves the rotation stalled but never broken", () => {
      const state = runScenario(ROTATION_STARTED_MS + 5_000);
      // A true zero-action baseline matches "activation-skipped" (see
      // rules.ts's NOTE on baseline-rotation-stalled): both rules are
      // authored identically for the default control combination
      // (newCredentialActivation=false, oldCredentialValidity="valid").
      expect(state.transitions.incidentState).toBe("activation-skipped");
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(state.values.newCredentialAdoptionPercent).toBe(0);
    });
  });

  describe("Sequencing trap #2: cohort progress without activation is not real", () => {
    it("advancing cohort stage without activating the new credential keeps adoption at 0", () => {
      const state = runScenario(ROTATION_STARTED_MS + 5_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
      ]);
      expect(state.transitions.incidentState).toBe("activation-skipped");
      expect(state.values.newCredentialAdoptionPercent).toBe(0);
      expect(state.values.rotationSafetyStatus).toBe("not-started");
    });

    it("activating the new credential first makes cohort verification real", () => {
      const state = runScenario(ROTATION_STARTED_MS + 5_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
      ]);
      expect(state.transitions.incidentState).toBe("all-cohorts-verified-overlap");
      expect(state.values.newCredentialAdoptionPercent).toBe(100);
    });
  });

  describe("Sequencing trap #1 (primary judgment): premature revocation before all cohorts verified", () => {
    it("revoking before any cohort verification creates a real, self-inflicted outage", () => {
      const baseline = runScenario(ROTATION_STARTED_MS + 10_000);
      const prematureState = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      expect(prematureState.transitions.incidentState).toBe("premature-gap");
      expect(prematureState.values.serviceToServiceCallSuccessRate as number).toBeLessThan(
        baseline.values.serviceToServiceCallSuccessRate as number,
      );
      // Purely an availability consequence — validation stayed enforced,
      // so no security violation occurred.
      expect(prematureState.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(prematureState.values.cumulativeUnauthenticatedCallCount).toBe(0);
    });

    it("revoking only after all cohorts verified reaches the safe end state, never the gap", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_STAGED_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
    });

    it("leaving a premature gap open through the sustained window widens the outage further (no new external cause)", () => {
      const early = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      const sustained = runScenario(SUSTAINED_GAP_MS + 5_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      expect(sustained.transitions.incidentState).toBe("premature-gap-sustained");
      expect(sustained.values.serviceToServiceCallSuccessRate as number).toBeLessThan(
        early.values.serviceToServiceCallSuccessRate as number,
      );
    });
  });

  describe("Required availability-good/security-bad trap: disabling credential validation", () => {
    it("disabling validation during a premature gap restores availability but creates real, nonzero unauthenticated calls", () => {
      const gapState = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      const bypassState = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      expect(bypassState.transitions.incidentState).toBe("bypass-active");
      // Availability genuinely improves relative to the open gap.
      expect(bypassState.values.serviceToServiceCallSuccessRate as number).toBeGreaterThan(
        gapState.values.serviceToServiceCallSuccessRate as number,
      );
      // But authentication is now real and genuinely compromised.
      expect(bypassState.values.genuinelyAuthenticatedCallPercent).toBe(0);
      expect(bypassState.values.cumulativeUnauthenticatedCallCount as number).toBeGreaterThan(0);
      expect(bypassState.values.rotationSafetyStatus).toBe("bypassed");
    });

    it("bypass can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_GAP_MS + 60_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      const eligibility = evaluateCompletionEligibility(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("bypass engaged pre-emptively (no revocation ever happened) is still a real, counted violation", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      expect(state.transitions.incidentState).toBe("bypass-preemptive");
      expect(state.values.cumulativeUnauthenticatedCallCount as number).toBeGreaterThan(0);
    });

    it("sustained bypass never auto-fails the attempt, even once the old sustained window is long past", () => {
      const state = runScenario(SUSTAINED_GAP_MS + 40_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        serviceToServiceCredentialRotationFailureSimulation.failureCondition.sustainedSeconds,
      );
      const finish = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Security QA: bypass cannot be laundered into a safe outcome", () => {
    it("re-enabling validation stops NEW unauthenticated calls but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      const correctedState = runScenario(ROTATION_STARTED_MS + 20_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
        { atMs: ROTATION_STARTED_MS + 11_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "enforced" },
      ]);
      expect(sealedUnsafeState.values.genuinelyAuthenticatedCallPercent).toBe(0);
      expect(correctedState.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(correctedState.peaks.peakValues.cumulativeUnauthenticatedCallCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeUnauthenticatedCallCount as number,
      );
    });

    it("full remediation after an unsafe bypass window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(ROLLBACK_PROPAGATION_FULLY_DONE_MS + 30_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
        { atMs: ROTATION_STARTED_MS + 3_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "enforced" },
        { atMs: ROTATION_STARTED_MS + 4_000, controlKey: ROLLBACK_OLD_CREDENTIAL_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 5_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "valid" },
        { atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
        { atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS + 3_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(state.values.cumulativeUnauthenticatedCallCount).toBe(0);
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier bypass window this
      // attempt passed through.
      expect(state.peaks.peakValues.cumulativeUnauthenticatedCallCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("bypass scores materially worse on dataIntegrity AND total than the premature gap it 'fixed', despite better availability", () => {
      const gapState = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      const bypassState = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      const gapScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        buildScoringInputs(gapState),
      );
      const bypassScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        buildScoringInputs(bypassState),
      );
      expect(bypassState.values.serviceToServiceCallSuccessRate as number).toBeGreaterThan(
        gapState.values.serviceToServiceCallSuccessRate as number,
      );
      expect(bypassScore.breakdown.dataIntegrity).toBeLessThan(gapScore.breakdown.dataIntegrity);
      expect(bypassScore.total).toBeLessThan(gapScore.total);
    });
  });

  describe("Sanctioned fix: deliberate, auditable rollback (never a reskin of bypass)", () => {
    it("rollback closes the gap with genuinely authenticated calls the entire time, zero historical violation", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_ROLLBACK_ACTIONS);
      expect(state.transitions.incidentState).toBe("rollback-just-issued");
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
      expect(state.values.cumulativeUnauthenticatedCallCount).toBe(0);
      expect(state.values.rotationSafetyStatus).toBe("rolled-back-safe");
    });

    it("the rollback flag alone, without re-extending validity, does not fix anything", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROLLBACK_OLD_CREDENTIAL_KEY, value: true },
      ]);
      // oldCredentialValidity is still "revoked" — the flag alone does
      // nothing; the gap persists.
      expect(state.transitions.incidentState).toBe("premature-gap");
    });
  });

  describe("Recovery lag: rollback propagation climbs only over real elapsed time", () => {
    it("immediately after rollback, success rate has not yet fully recovered", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_ROLLBACK_ACTIONS);
      expect(state.transitions.incidentState).toBe("rollback-just-issued");
      expect(state.values.serviceToServiceCallSuccessRate as number).toBeLessThan(99);
    });

    it("rollback propagation window 1 shows real, partial recovery above the just-issued value", () => {
      const justIssued = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_ROLLBACK_ACTIONS);
      const window1 = runScenario(ROLLBACK_PROPAGATION_WINDOW_1_MS + 5_000, SAFE_ROLLBACK_ACTIONS);
      expect(window1.transitions.incidentState).toBe("rollback-recovering-window1");
      expect(window1.values.serviceToServiceCallSuccessRate as number).toBeGreaterThan(
        justIssued.values.serviceToServiceCallSuccessRate as number,
      );
    });

    it("only after the full propagation window does success rate reach genuine full recovery", () => {
      const state = runScenario(ROLLBACK_PROPAGATION_FULLY_DONE_MS + 5_000, SAFE_ROLLBACK_ACTIONS);
      expect(state.transitions.incidentState).toBe("rollback-recovered");
      expect(state.values.serviceToServiceCallSuccessRate as number).toBeGreaterThan(99);
    });
  });

  describe("Safe staged cohort progress (overlap maintained throughout)", () => {
    it("cohort 1 verified is real, bounded progress with zero authentication cost", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-1-verified" },
      ]);
      expect(state.transitions.incidentState).toBe("cohort1-verified-overlap");
      expect(state.values.newCredentialAdoptionPercent).toBe(35);
      expect(state.values.genuinelyAuthenticatedCallPercent).toBe(100);
    });

    it("cohort 2 verified shows further progress than cohort 1", () => {
      const cohort1 = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-1-verified" },
      ]);
      const cohort2 = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-2-verified" },
      ]);
      expect(cohort2.values.newCredentialAdoptionPercent as number).toBeGreaterThan(
        cohort1.values.newCredentialAdoptionPercent as number,
      );
    });

    it("all cohorts verified without revocation yet reaches the acceptable tier", () => {
      const state = runScenario(ROTATION_STARTED_MS + 30_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
      ]);
      expect(state.transitions.incidentState).toBe("all-cohorts-verified-overlap");
      const eligibility = evaluateCompletionEligibility(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("Alternate strong path: rollback-after-mistake reaches the same OPTIMAL end state as never erring", () => {
    it("the never-erring staged path reaches fully-rotated-safe", () => {
      const state = runScenario(ROTATION_STARTED_MS + 30_000, SAFE_STAGED_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      const eligibility = evaluateCompletionEligibility(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the rollback-after-mistake path also reaches fully-rotated-safe, given enough elapsed recovery time", () => {
      const actions: TimedAction[] = [
        ...SAFE_ROLLBACK_ACTIONS,
        { atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
        { atMs: ROLLBACK_PROPAGATION_FULLY_DONE_MS + 3_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ];
      const state = runScenario(ROLLBACK_PROPAGATION_FULLY_DONE_MS + 30_000, actions);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      const eligibility = evaluateCompletionEligibility(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Multi-step path", () => {
    it("step 1 alone (activate new credential) is safe but makes no adoption progress yet", () => {
      const state = runScenario(ROTATION_STARTED_MS + 5_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
      ]);
      expect(state.transitions.incidentState).toBe("activated-no-cohorts");
      expect(state.values.newCredentialAdoptionPercent).toBe(0);
    });

    it("step 2 on top of step 1 (verify cohort 1) makes real, bounded progress", () => {
      const state = runScenario(ROTATION_STARTED_MS + 5_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-1-verified" },
      ]);
      expect(state.transitions.incidentState).toBe("cohort1-verified-overlap");
    });

    it("step 3 on top of steps 1-2 (verify all cohorts, then revoke) reaches the full safe end state", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_STAGED_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the rotation starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(ROTATION_STARTED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger the rotation, take zero action, Finish -> declared_unstable (expected default)", () => {
      const state = runScenario(ROTATION_STARTED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after the sustained-gap window still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_GAP_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("candidate_declared still resolves to declared_unstable on a sustained bypass, even though the attempt never auto-fails", () => {
      const state = runScenario(SUSTAINED_GAP_MS + 40_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      const result = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-rotated-safe) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(ROTATION_STARTED_MS + 30_000, SAFE_STAGED_ROTATION_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, state);
      const inputs = extractFinishScoringInputs(serviceToServiceCredentialRotationFailureSimulation, result);
      const score = scoreAuthoredAttempt(SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (all-cohorts-verified-overlap) scores well but below optimal", () => {
      const optimalState = runScenario(ROTATION_STARTED_MS + 30_000, SAFE_STAGED_ROTATION_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        extractFinishScoringInputs(serviceToServiceCredentialRotationFailureSimulation, optimalResult),
      );

      const acceptableState = runScenario(ROTATION_STARTED_MS + 30_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(serviceToServiceCredentialRotationFailureSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        extractFinishScoringInputs(serviceToServiceCredentialRotationFailureSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_GAP_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (bypass) scores worse than the premature gap it 'fixed' on dataIntegrity AND total, despite superficially better availability", () => {
      const gapState = runScenario(SUSTAINED_GAP_MS + 60_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
      ]);
      const bypassState = runScenario(SUSTAINED_GAP_MS + 60_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      const gapScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        buildScoringInputs(gapState),
      );
      const bypassScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        buildScoringInputs(bypassState),
      );
      expect(bypassState.values.serviceToServiceCallSuccessRate as number).toBeGreaterThan(
        gapState.values.serviceToServiceCallSuccessRate as number,
      );
      expect(bypassScore.breakdown.dataIntegrity).toBeLessThan(gapScore.breakdown.dataIntegrity);
      expect(bypassScore.total).toBeLessThan(gapScore.total);
      console.log("HARMFUL (bypass) SCORE", JSON.stringify(bypassScore));
      console.log("PREMATURE-GAP BASELINE SCORE (for comparison)", JSON.stringify(gapScore));
    });

    it("harmful path (bypass) also scores worse than the true zero-action baseline", () => {
      const baselineState = runScenario(SUSTAINED_GAP_MS + 60_000);
      const bypassState = runScenario(SUSTAINED_GAP_MS + 60_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        buildScoringInputs(baselineState),
      );
      const bypassScore = scoreAuthoredAttempt(
        SERVICE_TO_SERVICE_CREDENTIAL_ROTATION_FAILURE_SCORING,
        buildScoringInputs(bypassState),
      );
      expect(bypassScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(bypassScore.total).toBeLessThan(baselineScore.total);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_STAGED_ROTATION_ACTIONS);
      const runB = runScenario(ROTATION_STARTED_MS + 10_000, SAFE_STAGED_ROTATION_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak unauthenticated-call count and authentication failure rate generically via numericWatchFields", () => {
      const state = runScenario(ROTATION_STARTED_MS + 10_000, [
        { atMs: ROTATION_STARTED_MS + 1_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
        { atMs: ROTATION_STARTED_MS + 2_000, controlKey: CREDENTIAL_VALIDATION_MODE_KEY, value: "disabled-temporarily" },
      ]);
      expect(state.peaks.peakValues.cumulativeUnauthenticatedCallCount).toBeGreaterThan(0);
    });
  });
});
