import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { secretLeakageContainmentIncident } from "./secret-leakage-containment-incident";
import {
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
  secretLeakageContainmentIncidentSimulation,
} from "./secret-leakage-containment-incident/definition";
import { secretLeakageContainmentIncidentCandidateUI } from "./secret-leakage-containment-incident/candidate-ui";
import { SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING } from "./secret-leakage-containment-incident/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  COHORT_A_MIGRATION_WINDOW_MS,
  COHORT_B_MIGRATION_WINDOW_MS,
  EXPOSURE_IDENTIFIED_MS,
  SUSTAINED_EXPOSURE_MS,
} from "./secret-leakage-containment-incident/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(secretLeakageContainmentIncidentSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += secretLeakageContainmentIncidentSimulation.tickMs
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
      secretLeakageContainmentIncidentSimulation,
      state,
      action,
      secretLeakageContainmentIncidentSimulation.tickMs,
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
      secretLeakageContainmentIncidentSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Safe sequence: narrow/monitor first, then issue a replacement
// credential, then stage rotation cohort by cohort, then fully revoke
// once both cohorts have migrated, then complete the audit review.
const SAFE_CONTAINMENT_FIRST_ACTIONS: TimedAction[] = [
  { atMs: EXPOSURE_IDENTIFIED_MS + 1_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "monitored" },
  { atMs: EXPOSURE_IDENTIFIED_MS + 2_000, controlKey: MISUSE_MONITORING_KEY, value: true },
  { atMs: EXPOSURE_IDENTIFIED_MS + 3_000, controlKey: INVESTIGATION_STATUS_KEY, value: "scope-identified" },
];

function safeFullSequenceActions(): TimedAction[] {
  return [
    ...SAFE_CONTAINMENT_FIRST_ACTIONS,
    { atMs: EXPOSURE_IDENTIFIED_MS + 4_000, controlKey: NEW_CREDENTIAL_ISSUED_KEY, value: true },
    { atMs: EXPOSURE_IDENTIFIED_MS + 5_000, controlKey: REVOCATION_SCOPE_KEY, value: "cohort-staged" },
    {
      atMs: EXPOSURE_IDENTIFIED_MS + COHORT_A_MIGRATION_WINDOW_MS + 1_000,
      controlKey: DEPENDENT_COHORT_MIGRATION_KEY,
      value: "cohort-a-migrated",
    },
    {
      atMs: EXPOSURE_IDENTIFIED_MS + COHORT_A_MIGRATION_WINDOW_MS + 2_000,
      controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
      value: "revoked",
    },
    {
      atMs: EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 1_000,
      controlKey: DEPENDENT_COHORT_MIGRATION_KEY,
      value: "cohort-a-and-b-migrated",
    },
    {
      atMs: EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 2_000,
      controlKey: AUDIT_LOG_REVIEW_KEY,
      value: true,
    },
  ];
}

describe("Secret Leakage Containment Incident", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(secretLeakageContainmentIncident.isFree).toBe(false);
      expect(secretLeakageContainmentIncident.library?.category).toBe("Security & Identity");
      expect(secretLeakageContainmentIncident.library?.tags.length).toBeGreaterThan(0);
      expect(secretLeakageContainmentIncident.library?.skills.length).toBeGreaterThan(0);
      expect(secretLeakageContainmentIncident.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(secretLeakageContainmentIncidentCandidateUI.metrics.length).toBeGreaterThanOrEqual(6);
      expect(secretLeakageContainmentIncidentCandidateUI.controls.length).toBe(7);
      expect(secretLeakageContainmentIncidentCandidateUI.components.length).toBe(5);
    });

    it("the architecture has exactly 5 flat nodes and 5 edges matching the spec", () => {
      expect(secretLeakageContainmentIncidentSimulation.architecture.nodes.length).toBe(5);
      expect(secretLeakageContainmentIncidentSimulation.architecture.edges.length).toBe(5);
    });

    it("the briefing explicitly states all four business invariants plus the security invariant", () => {
      expect(secretLeakageContainmentIncident.description).toMatch(/blast radius/i);
      expect(secretLeakageContainmentIncident.description).toMatch(/real, avoidable outage/i);
      expect(secretLeakageContainmentIncident.description).toMatch(/auditable historical fact/i);
      expect(secretLeakageContainmentIncident.description).toMatch(/sequenced replacement plan/i);
      expect(secretLeakageContainmentIncident.description).toMatch(/never acceptable/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of secretLeakageContainmentIncidentSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control is exercised by at least one action classification rule", () => {
      const controlKeys = secretLeakageContainmentIncidentSimulation.controls.map((c) => c.key);
      const classifiedKeys = new Set(
        secretLeakageContainmentIncidentSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const key of controlKeys) {
        expect(classifiedKeys.has(key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(secretLeakageContainmentIncidentSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.suspectedExposedCredentialUseCount).toBe(0);
      expect(state.values.credentialContainmentStatus).toBe("trusted");
    });

    it("exposure-identified triggers the incident while availability stays fully healthy (decoy signal)", () => {
      const state = runScenario(EXPOSURE_IDENTIFIED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(EXPOSURE_IDENTIFIED_MS);
      expect(state.values.applicationRequestSuccessRate).toBe(99.9);
      expect(state.values.externalIntegrationSuccessRate).toBe(99.8);
      expect(state.values.credentialContainmentStatus).toBe("trusted");
    });

    describe("Required unsafe trap #1: continuing to fully trust the exposed credential", () => {
      it("availability stays perfect while a historical exposure count accumulates", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000);
        expect(state.transitions.incidentState).toBe("fully-trusted-baseline-exposure");
        expect(state.values.applicationRequestSuccessRate).toBe(99.9);
        expect(state.values.externalIntegrationSuccessRate).toBe(99.8);
        expect(state.values.credentialContainmentStatus).toBe("trusted");
        expect(state.values.suspectedExposedCredentialUseCount as number).toBeGreaterThan(0);
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("the historical count compounds the longer the credential is left fully trusted (sustained window)", () => {
        const early = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000);
        const sustained = runScenario(SUSTAINED_EXPOSURE_MS + 10_000);
        expect(sustained.transitions.incidentState).toBe("fully-trusted-sustained-exposure");
        expect(sustained.values.suspectedExposedCredentialUseCount as number).toBeGreaterThan(
          early.values.suspectedExposedCredentialUseCount as number,
        );
      });

      it("holding the do-nothing path through the sustained window reaches automatic failure", () => {
        const state = runScenario(SUSTAINED_EXPOSURE_MS + 50_000);
        expect(state.status).toBe("failed");
        expect(state.failedAtMs).not.toBeNull();
      });

      it("Finish returns unstable regardless of how healthy availability looks", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000);
        const finish = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
        expect(finish.outcome).toBe("declared_unstable");
      });

      it("the non-resetting historical count survives later containment (peak tracking)", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 60_000, [
          { atMs: EXPOSURE_IDENTIFIED_MS + 15_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "monitored" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 16_000, controlKey: MISUSE_MONITORING_KEY, value: true },
        ]);
        // Live value resets to 0 once containment genuinely begins...
        expect(state.values.suspectedExposedCredentialUseCount).toBe(0);
        // ...but the permanent peak record does not.
        expect(state.peaks.peakValues.suspectedExposedCredentialUseCount).toBeGreaterThan(0);
      });
    });

    describe("Required unsafe trap #2: unsequenced broad-immediate revocation", () => {
      it("fixes the security exposure instantly but breaks real dependent systems with zero migration", () => {
        const baseline = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000);
        const broadRevoked = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          { atMs: EXPOSURE_IDENTIFIED_MS + 1_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "revoked" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 2_000, controlKey: REVOCATION_SCOPE_KEY, value: "broad-immediate" },
        ]);
        expect(broadRevoked.transitions.incidentState).toBe("broad-immediate-revocation-zero-migrated");
        // Security exposure is genuinely gone...
        expect(broadRevoked.values.suspectedExposedCredentialUseCount).toBe(0);
        // ...but availability is now strictly WORSE than doing nothing.
        expect(broadRevoked.values.applicationRequestSuccessRate as number).toBeLessThan(
          baseline.values.applicationRequestSuccessRate as number,
        );
        expect(broadRevoked.values.externalIntegrationSuccessRate as number).toBeLessThan(
          baseline.values.externalIntegrationSuccessRate as number,
        );
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, broadRevoked);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("partial migration still leaves the not-yet-migrated cohort broken", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          { atMs: EXPOSURE_IDENTIFIED_MS + 1_000, controlKey: DEPENDENT_COHORT_MIGRATION_KEY, value: "cohort-a-migrated" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 2_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "revoked" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 3_000, controlKey: REVOCATION_SCOPE_KEY, value: "broad-immediate" },
        ]);
        expect(state.transitions.incidentState).toBe("broad-immediate-revocation-cohort-a-migrated");
        expect(state.values.externalIntegrationSuccessRate as number).toBeLessThan(99);
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Legitimate containment-first state: monitored", () => {
      it("narrowing to monitored with active monitoring and scope identified is a real, safe, bounded tradeoff", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 30_000, SAFE_CONTAINMENT_FIRST_ACTIONS);
        expect(state.transitions.incidentState).toBe("monitored-scope-identified");
        expect(state.values.credentialContainmentStatus).toBe("monitored");
        expect(state.values.suspectedExposedCredentialUseCount).toBe(0);
        expect(state.values.applicationRequestSuccessRate).toBe(99.9);
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });

      it("investigationStatus is not a dead control: scope stays unknown without it", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          { atMs: EXPOSURE_IDENTIFIED_MS + 1_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "monitored" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 2_000, controlKey: MISUSE_MONITORING_KEY, value: true },
        ]);
        expect(state.transitions.incidentState).toBe("monitored-investigation-not-started");
        expect(state.values.blastRadiusStatus).toBe("unknown");
      });

      it("misuseMonitoring is not a dead control: monitored mode without it reaches a distinct state", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          { atMs: EXPOSURE_IDENTIFIED_MS + 1_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "monitored" },
        ]);
        expect(state.transitions.incidentState).toBe("monitored-without-active-monitoring");
      });
    });

    describe("Sequencing sensitivity: safe cohort-staged rotation requires real elapsed migration time", () => {
      it("a new credential alone does not instantly migrate anyone (recovery lag, tick-zero proof)", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          ...SAFE_CONTAINMENT_FIRST_ACTIONS,
          { atMs: EXPOSURE_IDENTIFIED_MS + 4_000, controlKey: NEW_CREDENTIAL_ISSUED_KEY, value: true },
          { atMs: EXPOSURE_IDENTIFIED_MS + 5_000, controlKey: REVOCATION_SCOPE_KEY, value: "cohort-staged" },
        ]);
        expect(state.transitions.incidentState).toBe("new-credential-issued-no-cohort-migrated-yet");
        expect(state.values.migratedCohortCount).toBe(0);
      });

      it("claiming cohort migration without ever issuing a new credential does not genuinely migrate anyone", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          ...SAFE_CONTAINMENT_FIRST_ACTIONS,
          { atMs: EXPOSURE_IDENTIFIED_MS + 4_000, controlKey: REVOCATION_SCOPE_KEY, value: "cohort-staged" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 5_000, controlKey: DEPENDENT_COHORT_MIGRATION_KEY, value: "cohort-a-migrated" },
        ]);
        expect(state.transitions.incidentState).toBe("cohort-migration-claimed-without-new-credential");
        expect(state.values.migratedCohortCount).toBe(0);
      });

      it("claiming cohort-A migration before the real elapsed window does not instantly complete it", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000, [
          ...SAFE_CONTAINMENT_FIRST_ACTIONS,
          { atMs: EXPOSURE_IDENTIFIED_MS + 4_000, controlKey: NEW_CREDENTIAL_ISSUED_KEY, value: true },
          { atMs: EXPOSURE_IDENTIFIED_MS + 5_000, controlKey: REVOCATION_SCOPE_KEY, value: "cohort-staged" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 6_000, controlKey: DEPENDENT_COHORT_MIGRATION_KEY, value: "cohort-a-migrated" },
        ]);
        expect(state.transitions.incidentState).toBe("staged-rotation-cohort-a-claimed-not-yet-elapsed");
        expect(state.values.migratedCohortCount).toBe(0);
      });

      it("once the real elapsed Cohort-A window passes, staged revocation for Cohort A alone is safe and distinct", () => {
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + COHORT_A_MIGRATION_WINDOW_MS + 10_000, [
          ...SAFE_CONTAINMENT_FIRST_ACTIONS,
          { atMs: EXPOSURE_IDENTIFIED_MS + 4_000, controlKey: NEW_CREDENTIAL_ISSUED_KEY, value: true },
          { atMs: EXPOSURE_IDENTIFIED_MS + 5_000, controlKey: REVOCATION_SCOPE_KEY, value: "cohort-staged" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 6_000, controlKey: DEPENDENT_COHORT_MIGRATION_KEY, value: "cohort-a-migrated" },
          { atMs: EXPOSURE_IDENTIFIED_MS + 7_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "revoked" },
        ]);
        expect(state.transitions.incidentState).toBe("staged-rotation-cohort-a-only");
        expect(state.values.migratedCohortCount).toBe(1);
        expect(state.values.credentialContainmentStatus).toBe("staged-rotation");
        expect(state.values.applicationRequestSuccessRate).toBe(99.9);
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });

      it("full safe sequence reaches fully-contained with zero avoidable breakage and zero security violation", () => {
        const state = runScenario(
          EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 30_000,
          safeFullSequenceActions(),
        );
        expect(state.transitions.incidentState).toBe("fully-contained-reviewed");
        expect(state.values.credentialContainmentStatus).toBe("fully-contained");
        expect(state.values.auditReviewStatus).toBe("reviewed");
        expect(state.values.migratedCohortCount).toBe(2);
        expect(state.values.applicationRequestSuccessRate).toBe(99.9);
        expect(state.values.externalIntegrationSuccessRate).toBe(99.8);
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      });

      it("fully contained without audit review is acceptable, not optimal — auditLogReviewCompleted is not a dead control", () => {
        const actions = safeFullSequenceActions().filter((a) => a.controlKey !== AUDIT_LOG_REVIEW_KEY);
        const state = runScenario(EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 30_000, actions);
        expect(state.transitions.incidentState).toBe("fully-contained-unreviewed");
        expect(state.values.credentialContainmentStatus).toBe("fully-contained");
        expect(state.values.auditReviewStatus).toBe("unreviewed");
        const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });
    });

    it("tracks peak historical exposure generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000);
      expect(state.peaks.peakValues.suspectedExposedCredentialUseCount).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(EXPOSURE_IDENTIFIED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("monitored-scope-identified is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(EXPOSURE_IDENTIFIED_MS + 30_000, SAFE_CONTAINMENT_FIRST_ACTIONS);
      const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      const finish = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("acceptable");
    });

    it("fully-contained-reviewed is Finish-eligible as optimal", () => {
      const state = runScenario(
        EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 30_000,
        safeFullSequenceActions(),
      );
      const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("fully-trusted baseline is never Finish-eligible at any tier", () => {
      const state = runScenario(EXPOSURE_IDENTIFIED_MS + 10_000);
      const eligibility = evaluateCompletionEligibility(secretLeakageContainmentIncidentSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 50_000);
      const result = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-contained-reviewed) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(
        EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 30_000,
        safeFullSequenceActions(),
      );
      const result = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, state);
      const inputs = extractFinishScoringInputs(secretLeakageContainmentIncidentSimulation, result);
      const score = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (monitored) scores well but below optimal", () => {
      const optimalState = runScenario(
        EXPOSURE_IDENTIFIED_MS + COHORT_B_MIGRATION_WINDOW_MS + 30_000,
        safeFullSequenceActions(),
      );
      const optimalResult = evaluateCandidateDeclaredFinish(secretLeakageContainmentIncidentSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(secretLeakageContainmentIncidentSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, optimalInputs);

      const acceptableState = runScenario(EXPOSURE_IDENTIFIED_MS + 30_000, SAFE_CONTAINMENT_FIRST_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        secretLeakageContainmentIncidentSimulation,
        acceptableState,
      );
      const acceptableInputs = extractFinishScoringInputs(
        secretLeakageContainmentIncidentSimulation,
        acceptableResult,
      );
      const acceptableScore = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      // Acceptable scores higher than optimal on recovery/customerImpact
      // (it genuinely resolves far faster, which is real and correctly
      // rewarded) but dataIntegrity + reliability's combined gap is
      // deliberately sized large enough to still keep optimal's TOTAL
      // ahead — see the score-sanity audit in definition.ts.
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThan(0);
      expect(acceptableScore.breakdown.reliability).toBeLessThan(optimalScore.breakdown.reliability);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
    });

    it("baseline (no action, fully-trusted) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (continuing to fully trust the credential) scores WORSE on dataIntegrity than baseline-adjacent monitored path despite perfect availability", () => {
      const baselineState = runScenario(SUSTAINED_EXPOSURE_MS + 60_000);
      const baselineInputs = buildScoringInputs(baselineState);
      const baselineScore = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, baselineInputs);

      const monitoredState = runScenario(SUSTAINED_EXPOSURE_MS + 60_000, SAFE_CONTAINMENT_FIRST_ACTIONS);
      const monitoredInputs = buildScoringInputs(monitoredState);
      const monitoredScore = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, monitoredInputs);

      // Availability-good / security-bad: the fully-trusted path has
      // IDENTICAL raw availability to the monitored path (both are
      // perfectly healthy)...
      expect(baselineState.values.applicationRequestSuccessRate).toBe(
        monitoredState.values.applicationRequestSuccessRate,
      );
      // ...but scores strictly worse on the dimension that matters.
      expect(baselineScore.breakdown.dataIntegrity).toBeLessThan(monitoredScore.breakdown.dataIntegrity);
      expect(baselineScore.total).toBeLessThan(monitoredScore.total);
      console.log("HARMFUL (fully-trusted, sustained) SCORE", JSON.stringify(baselineScore));
      console.log("MONITORED SCORE (for comparison)", JSON.stringify(monitoredScore));
    });

    it("the broad-immediate-revocation trap scores worse on reliability than the monitored acceptable path", () => {
      const monitoredState = runScenario(EXPOSURE_IDENTIFIED_MS + 60_000, SAFE_CONTAINMENT_FIRST_ACTIONS);
      const monitoredInputs = buildScoringInputs(monitoredState);
      const monitoredScore = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, monitoredInputs);

      const brokenState = runScenario(EXPOSURE_IDENTIFIED_MS + 60_000, [
        { atMs: EXPOSURE_IDENTIFIED_MS + 1_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "revoked" },
        { atMs: EXPOSURE_IDENTIFIED_MS + 2_000, controlKey: REVOCATION_SCOPE_KEY, value: "broad-immediate" },
      ]);
      const brokenInputs = buildScoringInputs(brokenState);
      const brokenScore = scoreAuthoredAttempt(SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING, brokenInputs);

      expect(brokenScore.breakdown.reliability).toBeLessThan(monitoredScore.breakdown.reliability);
      expect(brokenScore.total).toBeLessThan(monitoredScore.total);
      console.log("BROAD-IMMEDIATE-REVOCATION SCORE", JSON.stringify(brokenScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(EXPOSURE_IDENTIFIED_MS + COHORT_A_MIGRATION_WINDOW_MS + 5_000, safeFullSequenceActions());
      const runB = runScenario(EXPOSURE_IDENTIFIED_MS + COHORT_A_MIGRATION_WINDOW_MS + 5_000, safeFullSequenceActions());
      expect(runA).toEqual(runB);
    });
  });
});
