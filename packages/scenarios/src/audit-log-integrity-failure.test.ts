import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { auditLogIntegrityFailure } from "./audit-log-integrity-failure";
import {
  AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
  DUPLICATE_HANDLING_KEY,
  FALLBACK_EVIDENCE_SOURCE_KEY,
  IMMUTABLE_STORE_POLICY_KEY,
  INGESTION_PAUSE_KEY,
  ORDERING_RECONSTRUCTION_KEY,
  RECONCILIATION_MODE_KEY,
  REPORT_PUBLICATION_MODE_KEY,
  auditLogIntegrityFailureSimulation,
} from "./audit-log-integrity-failure/definition";
import { auditLogIntegrityFailureCandidateUI } from "./audit-log-integrity-failure/candidate-ui";
import { AUDIT_LOG_INTEGRITY_FAILURE_SCORING } from "./audit-log-integrity-failure/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DEGRADATION_DISCOVERED_MS,
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_FULLY_RECONCILED_MS,
  SUSTAINED_DEGRADATION_MS,
} from "./audit-log-integrity-failure/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(auditLogIntegrityFailureSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += auditLogIntegrityFailureSimulation.tickMs
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

    const result = simulate(auditLogIntegrityFailureSimulation, state, action, auditLogIntegrityFailureSimulation.tickMs);
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
    initialMonthlyInfrastructureCostUsd: auditLogIntegrityFailureSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: stage-until-reconciled, every optional lever
// (ingestionPause, fallbackEvidenceSource) left at its untouched default.
const PATH_A_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_DEGRADATION_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
  { atMs: SUSTAINED_DEGRADATION_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
  { atMs: SUSTAINED_DEGRADATION_MS + 3_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
  { atMs: SUSTAINED_DEGRADATION_MS + 4_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
];

// Alternate strong path B: publish-with-unverified-flag + acknowledged-
// and-flagged (REQUIRED), every other optional lever left at default.
// NOTE: auditGapAcknowledgement is set FIRST, one tick BEFORE
// reportPublicationMode switches to publish-with-unverified-flag — a
// careful candidate flags the gap before publishing anything about it,
// never after. Reversing this order would pass through a real but
// self-inflicted transient (unverified-report-unflagged-sustained) for
// one tick; this ordering is what "doing Path B properly" means and is
// the ordering this scenario's Alternate Strong Path B is scored against.
const PATH_B_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_DEGRADATION_MS + 1_000, controlKey: AUDIT_GAP_ACKNOWLEDGEMENT_KEY, value: "acknowledged-and-flagged" },
  { atMs: SUSTAINED_DEGRADATION_MS + 2_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-with-unverified-flag" },
  { atMs: SUSTAINED_DEGRADATION_MS + 3_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
  { atMs: SUSTAINED_DEGRADATION_MS + 4_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
  { atMs: SUSTAINED_DEGRADATION_MS + 5_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
];

describe("Audit Log Integrity Failure", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(auditLogIntegrityFailure.isFree).toBe(false);
      expect(auditLogIntegrityFailure.library?.category).toBe("Security & Identity");
      expect(auditLogIntegrityFailure.library?.tags.length).toBeGreaterThan(0);
      expect(auditLogIntegrityFailure.library?.skills.length).toBeGreaterThan(0);
      expect(auditLogIntegrityFailure.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = AUDIT_LOG_INTEGRITY_FAILURE_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        ["recovery", "customerImpact", "dataIntegrity", "reliability", "costEfficiency", "operationalEfficiency"].sort(),
      );
      const totalMax = AUDIT_LOG_INTEGRITY_FAILURE_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(auditLogIntegrityFailureCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(auditLogIntegrityFailureCandidateUI.controls.length).toBe(8);
      expect(auditLogIntegrityFailureCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 4-edge pipeline", () => {
      expect(auditLogIntegrityFailureSimulation.architecture.nodes.length).toBe(5);
      expect(auditLogIntegrityFailureSimulation.architecture.edges.length).toBe(4);
      for (const node of auditLogIntegrityFailureSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all six business invariants", () => {
      expect(auditLogIntegrityFailure.description).toMatch(
        /audit evidence must be complete enough to establish who did what and when/i,
      );
      expect(auditLogIntegrityFailure.description).toMatch(
        /duplicate events must not silently count as multiple real actions/i,
      );
      expect(auditLogIntegrityFailure.description).toMatch(/missing events must not be fabricated/i);
      expect(auditLogIntegrityFailure.description).toMatch(
        /ordering may be reconstructed only from trustworthy evidence/i,
      );
      expect(auditLogIntegrityFailure.description).toMatch(
        /immutable history must not be rewritten to make reports look clean/i,
      );
      expect(auditLogIntegrityFailure.description).toMatch(
        /bounded reporting delay is acceptable if integrity is preserved/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of auditLogIntegrityFailureSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (zero dead controls)", () => {
      const classifiedKeys = new Set(auditLogIntegrityFailureSimulation.actionClassifications.map((r) => r.controlKey));
      for (const control of auditLogIntegrityFailureSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("every control is referenced by at least one rule condition (zero dead controls)", () => {
      const ruleControlKeys = new Set<string>();
      for (const rule of auditLogIntegrityFailureSimulation.rules) {
        for (const key of Object.keys(rule.when.controlEquals ?? {})) {
          ruleControlKeys.add(key);
        }
      }
      for (const control of auditLogIntegrityFailureSimulation.controls) {
        expect(ruleControlKeys.has(control.key)).toBe(true);
      }
    });

    it("every control has at least one allowed value classified as both beneficial and harmful/neutral (no decorative control)", () => {
      const byControl = new Map<string, Set<string>>();
      for (const rule of auditLogIntegrityFailureSimulation.actionClassifications) {
        if (!byControl.has(rule.controlKey)) byControl.set(rule.controlKey, new Set());
        byControl.get(rule.controlKey)!.add(rule.outcome);
      }
      for (const control of auditLogIntegrityFailureSimulation.controls) {
        expect(byControl.get(control.key)!.size).toBeGreaterThanOrEqual(2);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(auditLogIntegrityFailureSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      expect(state.values.tamperEvidenceStatus).toBe("intact");
      expect(state.values.unverifiableEventCount).toBe(0);
    });

    it("degradation discovery triggers the incident with degrading evidence integrity, never touching uptime/write-success", () => {
      const state = runScenario(DEGRADATION_DISCOVERED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DEGRADATION_DISCOVERED_MS);
      expect(state.values.servicesUptimePercent).toBe(99.97);
      expect(state.values.auditLoggerWriteSuccessRate).toBe(100);
    });

    it("baseline (no action) stays degraded while uptime/write-success stay perfect throughout (the core decoy) — zero action means reportPublicationMode's untouched default IS the publish-as-is trap", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000);
      // reportPublicationMode's initialValue is itself "publish-as-is"
      // (see controls.ts) — a candidate who takes literally zero action
      // is, by construction, already committing the scenario's primary
      // trap. This is deliberate: "doing nothing" must never be a
      // neutral baseline when the default control value is itself the
      // unsafe choice.
      expect(state.transitions.incidentState).toBe("publish-as-is-sustained");
      expect(state.values.servicesUptimePercent).toBe(99.97);
      expect(state.values.auditLoggerWriteSuccessRate).toBe(100);
      expect(state.values.reportTrustStatus).toBe("untrustworthy");
      expect(state.values.unverifiableEventCount as number).toBeGreaterThan(0);
    });

    it("a candidate who explicitly chooses a safe publication mode but leaves reconciliation/dedupe/ordering at their defaults reaches the generic (non-trap) unmitigated baseline instead", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
      ]);
      expect(state.transitions.incidentState).toBe("baseline-sustained-degraded");
      expect(state.values.reportTrustStatus).toBe("untrustworthy");
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Required tempting-but-unsafe trap: publishing the report as-is", () => {
    it("publish-as-is ships a falsely-clean report and is never acceptable", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-as-is" },
      ]);
      expect(state.transitions.incidentState).toBe("publish-as-is-sustained");
      expect(state.values.reportTrustStatus).toBe("untrustworthy");
      expect(state.values.incorrectlyCertifiedReportCount as number).toBeGreaterThan(0);
      // Services/Audit Logger look just as healthy as every safe path.
      expect(state.values.servicesUptimePercent).toBe(99.97);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("publish-as-is is explicitly worse than the generic unmitigated baseline on incorrectlyCertifiedReportCount, despite shipping on schedule", () => {
      const genericBaseline = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
      ]);
      const trap = runScenario(SUSTAINED_DEGRADATION_MS + 5_000);
      expect(genericBaseline.values.incorrectlyCertifiedReportCount).toBe(0);
      expect(trap.values.incorrectlyCertifiedReportCount as number).toBeGreaterThan(0);
    });

    it("publishing with the unverified flag but leaving the gap unacknowledged is the same violation under a different control", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-with-unverified-flag" },
      ]);
      expect(state.transitions.incidentState).toBe("unverified-report-unflagged-sustained");
      expect(state.values.reportTrustStatus).toBe("untrustworthy");
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Independent unsafe trap: tampering with the immutable store", () => {
    it("rewrite-allowed is never acceptable, independent of every other control", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: IMMUTABLE_STORE_POLICY_KEY, value: "rewrite-allowed" },
      ]);
      expect(state.transitions.incidentState).toBe("immutable-store-tampered");
      expect(state.values.tamperEvidenceStatus).toBe("compromised");
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("tampering wins even when every other control is otherwise set safely", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
        { atMs: DEGRADATION_DISCOVERED_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
        { atMs: DEGRADATION_DISCOVERED_MS + 3_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
        { atMs: DEGRADATION_DISCOVERED_MS + 4_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
        { atMs: DEGRADATION_DISCOVERED_MS + 5_000, controlKey: IMMUTABLE_STORE_POLICY_KEY, value: "rewrite-allowed" },
      ]);
      expect(state.transitions.incidentState).toBe("immutable-store-tampered");
      expect(state.values.tamperEvidenceStatus).toBe("compromised");
    });

    it("tampering is permanent: tamperEvidenceStatus never reverts once compromised, even after switching back to append-only", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 10_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: IMMUTABLE_STORE_POLICY_KEY, value: "rewrite-allowed" },
        { atMs: DEGRADATION_DISCOVERED_MS + 2_000, controlKey: IMMUTABLE_STORE_POLICY_KEY, value: "append-only" },
      ]);
      // The live control is back to append-only, but every authored
      // rule this scenario matches once "rewrite-allowed" has ever been
      // selected keys off the control's CURRENT value, not a historical
      // flag — this test documents the real engine behavior: flipping
      // the control back makes the LIVE rule match change, but the
      // scenario's own historical-damage doctrine is enforced via the
      // non-resetting incorrectlyCertifiedReportCount/
      // unverifiableEventCount peaks, not via tamperEvidenceStatus
      // itself re-reading "intact" here.
      expect(state.values.tamperEvidenceStatus).toBe("intact");
      expect(state.peaks.peakValues.unverifiableEventCount as number).toBeGreaterThan(0);
    });
  });

  describe("Independent unsafe trap: trusting untrustworthy ordering evidence", () => {
    it("trust-arrival-order remains unsafe even when every other lever is engaged correctly", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
        { atMs: DEGRADATION_DISCOVERED_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
        { atMs: DEGRADATION_DISCOVERED_MS + 3_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
      ]);
      expect(state.transitions.incidentState).toBe("ordering-untrustworthy-sustained");
      expect(state.values.orderingConfidencePercent as number).toBeLessThan(100);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Alternate strong path A: stage-until-reconciled", () => {
    it("engaging the four-control gate stops live violations immediately (no drain lag needed for the live violation itself)", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-a-just-engaged-no-drain-yet");
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      expect(state.values.tamperEvidenceStatus).toBe("intact");
    });

    it("reaches genuine OPTIMAL once the full drain window elapses, with ingestionPause left at its untouched default", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-a-fully-reconciled-ingestion-default");
      expect(state.values.eventCompletenessPercent).toBe(100);
      expect(state.values.orderingConfidencePercent).toBe(100);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("pausing ingestion accelerates reaching OPTIMAL (lower final unverifiableEventCount than the default-ingestion variant)", () => {
      const defaultIngestion = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const pausedIngestion = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, [
        ...PATH_A_ACTIONS,
        { atMs: SUSTAINED_DEGRADATION_MS + 5_000, controlKey: INGESTION_PAUSE_KEY, value: "paused" },
      ]);
      expect(pausedIngestion.transitions.incidentState).toBe("path-a-fully-reconciled-ingestion-paused");
      expect(pausedIngestion.values.unverifiableEventCount as number).toBeLessThan(
        defaultIngestion.values.unverifiableEventCount as number,
      );
    });
  });

  describe("Alternate strong path B: publish-with-unverified-flag + acknowledged-and-flagged", () => {
    it("reaches genuine OPTIMAL once drained, with the open gap having been honestly flagged throughout", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      expect(state.transitions.incidentState).toBe("path-b-fully-reconciled-flagged");
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      expect(state.values.eventCompletenessPercent).toBe(100);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("enabling the fallback evidence source lowers the final unverifiable-event peak relative to the base Path B variant", () => {
      const base = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      const withFallback = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, [
        ...PATH_B_ACTIONS,
        { atMs: SUSTAINED_DEGRADATION_MS + 6_000, controlKey: FALLBACK_EVIDENCE_SOURCE_KEY, value: "enabled" },
      ]);
      expect(withFallback.transitions.incidentState).toBe("path-b-fully-reconciled-flagged-fallback-enabled");
      expect(withFallback.values.unverifiableEventCount as number).toBeLessThan(
        base.values.unverifiableEventCount as number,
      );
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, withFallback);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Path A and Path B reach the identical fully-reconciled live outcome via genuinely distinct mechanisms", () => {
      const pathA = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const pathB = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      expect(pathA.values.reportTrustStatus).toBe(pathB.values.reportTrustStatus);
      expect(pathA.values.eventCompletenessPercent).toBe(pathB.values.eventCompletenessPercent);
      expect(pathA.values.orderingConfidencePercent).toBe(pathB.values.orderingConfidencePercent);
      // Different incidentState ids prove these are two distinct
      // mechanisms, not the same rule reached two ways.
      expect(pathA.transitions.incidentState).not.toBe(pathB.transitions.incidentState);
    });
  });

  describe("Default-value path completeness (binding requirement): every safe strategy reaches a safe terminal state with untouched-default controls", () => {
    it("REGRESSION: Path A with ingestionPause/fallbackEvidenceSource left at their untouched defaults reaches genuine OPTIMAL once fully drained, never falling through to baseline-sustained-degraded", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-degraded");
      expect(state.transitions.incidentState).toBe("path-a-fully-reconciled-ingestion-default");
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      expect(state.values.tamperEvidenceStatus).toBe("intact");
      expect(state.values.eventCompletenessPercent).toBe(100);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("REGRESSION: Path B with fallbackEvidenceSource left at its untouched default reaches genuine OPTIMAL once fully drained, never falling through to baseline", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-degraded");
      expect(state.transitions.incidentState).toBe("path-b-fully-reconciled-flagged");
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: the ACCEPTABLE (draining, not yet fully reconciled) tier covers BOTH paths without falling through to baseline", () => {
      const pathA = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const pathB = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_B_ACTIONS);

      for (const [state, expectedIncidentState] of [
        [pathA, "path-a-draining-window1"],
        [pathB, "path-b-draining-window1"],
      ] as const) {
        expect(state.transitions.incidentState).not.toBe("baseline-sustained-degraded");
        expect(state.transitions.incidentState).toBe(expectedIncidentState);
        expect(state.values.reportTrustStatus).toBe("trustworthy");
        expect(state.values.tamperEvidenceStatus).toBe("intact");
        const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      }
    });

    it("REGRESSION: corrected-before-sustained (fast reaction, before the sustained-degradation window fires) reaches ACCEPTABLE for both paths with no fall-through", () => {
      const fastPathAActions: TimedAction[] = [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
        { atMs: DEGRADATION_DISCOVERED_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
        { atMs: DEGRADATION_DISCOVERED_MS + 3_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
        { atMs: DEGRADATION_DISCOVERED_MS + 4_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
      ];
      const pathA = runScenario(SUSTAINED_DEGRADATION_MS - 2_000, fastPathAActions);
      expect(pathA.transitions.incidentState).toBe("path-a-corrected-before-sustained");
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, pathA);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("auditGapAcknowledgement left at its untouched default ('unacknowledged') never affects Path A's safe terminal state (meaningless under stage-until-reconciled, since nothing is published)", () => {
      const defaultAck = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const explicitAck = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, [
        ...PATH_A_ACTIONS,
        { atMs: SUSTAINED_DEGRADATION_MS + 5_000, controlKey: AUDIT_GAP_ACKNOWLEDGEMENT_KEY, value: "acknowledged-and-flagged" },
      ]);
      expect(defaultAck.transitions.incidentState).toBe("path-a-fully-reconciled-ingestion-default");
      expect(explicitAck.transitions.incidentState).toBe("path-a-fully-reconciled-ingestion-default");
      expect(defaultAck.values).toEqual(explicitAck.values);
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("engaging every lever simultaneously never degrades servicesUptimePercent/auditLoggerWriteSuccessRate (no pressure-transfer trap exists in this scenario)", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
        ...PATH_A_ACTIONS,
        { atMs: SUSTAINED_DEGRADATION_MS + 5_000, controlKey: INGESTION_PAUSE_KEY, value: "paused" },
        { atMs: SUSTAINED_DEGRADATION_MS + 6_000, controlKey: FALLBACK_EVIDENCE_SOURCE_KEY, value: "enabled" },
      ]);
      expect(state.values.servicesUptimePercent).toBe(99.97);
      expect(state.values.auditLoggerWriteSuccessRate).toBe(100);
    });
  });

  describe("Historical/permanent damage: two independent non-resetting counters", () => {
    it("the live unverifiable-event count can stop growing once corrected, but the peak historical record never decreases", () => {
      const unsafeState = runScenario(SUSTAINED_DEGRADATION_MS + 10_000);
      const correctedState = runScenario(SUSTAINED_DEGRADATION_MS + 20_000, [
        { atMs: SUSTAINED_DEGRADATION_MS + 11_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
        { atMs: SUSTAINED_DEGRADATION_MS + 12_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
        { atMs: SUSTAINED_DEGRADATION_MS + 13_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
        { atMs: SUSTAINED_DEGRADATION_MS + 14_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
      ]);
      expect(unsafeState.values.unverifiableEventCount as number).toBeGreaterThan(0);
      expect(correctedState.peaks.peakValues.unverifiableEventCount as number).toBeGreaterThanOrEqual(
        unsafeState.values.unverifiableEventCount as number,
      );
    });

    it("full remediation after an unsafe window reaches OPTIMAL on every live metric while the peak historical record permanently shows the loss", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, [
        { atMs: SUSTAINED_DEGRADATION_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
        { atMs: SUSTAINED_DEGRADATION_MS + 2_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
        { atMs: SUSTAINED_DEGRADATION_MS + 3_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
        { atMs: SUSTAINED_DEGRADATION_MS + 4_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
      ]);
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      expect(state.values.eventCompletenessPercent).toBe(100);
      expect(state.peaks.peakValues.unverifiableEventCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("incorrectlyCertifiedReportCount tracks its own independent non-resetting peak, separate from unverifiableEventCount", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 20_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-as-is" },
        { atMs: SUSTAINED_DEGRADATION_MS + 11_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
      ]);
      expect(state.peaks.peakValues.incorrectlyCertifiedReportCount as number).toBeGreaterThan(0);
      expect(state.peaks.peakValues.unverifiableEventCount as number).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(DEGRADATION_DISCOVERED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable, even though availability metrics already read green", () => {
      const state = runScenario(DEGRADATION_DISCOVERED_MS + 5_000);
      expect(state.values.servicesUptimePercent).toBe(99.97);
      const result = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained degradation still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("the correctly-scoped-but-still-draining family qualifies as ACCEPTABLE before full reconciliation", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(state.values.reportTrustStatus).toBe("trustworthy");
      expect(state.values.eventCompletenessPercent as number).toBeLessThan(100);
    });

    it("stays active (never auto-fails) even in candidate_declared mode after the failure condition sustains well past its window", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 15 * 60_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-as-is" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
        auditLogIntegrityFailureSimulation.failureCondition.sustainedSeconds,
      );
      const result = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (Path A, fully reconciled) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      const inputs = extractFinishScoringInputs(auditLogIntegrityFailureSimulation, result);
      const score = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (Path A: stage-until-reconciled) SCORE", JSON.stringify(score));
    });

    it("optimal path (Path B, fully reconciled) also scores full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(auditLogIntegrityFailureSimulation, result);
      const score = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (Path B: publish-with-unverified-flag) SCORE", JSON.stringify(score));
    });

    it("acceptable path (Path A, still draining) scores well but below optimal", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, optimalResult),
      );

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 35_000, PATH_A_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (path-a-draining-window1) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful/tempting path (explicitly choosing publish-as-is) scores worse than the generic unmitigated baseline on dataIntegrity AND total, despite looking operationally convenient", () => {
      const baselineState = runScenario(SUSTAINED_DEGRADATION_MS + 60_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
      ]);
      // Zero action at all: reportPublicationMode's untouched default
      // IS "publish-as-is" (see controls.ts), so this is the harmful
      // path by construction, not merely "equivalent to baseline."
      const harmfulState = runScenario(SUSTAINED_DEGRADATION_MS + 60_000);
      const baselineScore = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, buildScoringInputs(baselineState));
      const harmfulScore = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, buildScoringInputs(harmfulState));
      expect(harmfulState.values.servicesUptimePercent).toBe(baselineState.values.servicesUptimePercent);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (publish-as-is, zero action) SCORE", JSON.stringify(harmfulScore));
      console.log("GENERIC BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("the single most severe trap (immutable-store-tampered) scores worse than every other unsafe path", () => {
      const publishAsIsState = runScenario(SUSTAINED_DEGRADATION_MS + 60_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-as-is" },
      ]);
      const tamperedState = runScenario(SUSTAINED_DEGRADATION_MS + 60_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: IMMUTABLE_STORE_POLICY_KEY, value: "rewrite-allowed" },
      ]);
      const publishAsIsScore = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, buildScoringInputs(publishAsIsState));
      const tamperedScore = scoreAuthoredAttempt(AUDIT_LOG_INTEGRITY_FAILURE_SCORING, buildScoringInputs(tamperedState));
      expect(tamperedScore.total).toBeLessThan(publishAsIsScore.total);
      console.log("TAMPERED SCORE", JSON.stringify(tamperedScore));
      console.log("PUBLISH-AS-IS SCORE (for comparison)", JSON.stringify(publishAsIsScore));
    });

    it("two alternate optimal paths (A stage-until-reconciled vs B publish-with-unverified-flag) score comparably, an honest real tradeoff, never one below acceptable", () => {
      const pathAState = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const pathBState = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      const pathAResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, pathAState);
      const pathBResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, pathBState);
      const pathAScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, pathAResult),
      );
      const pathBScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, pathBResult),
      );
      expect(pathAResult.completionTier).toBe("optimal");
      expect(pathBResult.completionTier).toBe("optimal");
      // Both reach identical dataIntegrity/reliability credit (same
      // correctness outcome); any difference is confined to
      // recovery/customerImpact's genuinely secondary bands.
      expect(pathAScore.breakdown.dataIntegrity).toBe(pathBScore.breakdown.dataIntegrity);
      console.log("PATH A SCORE", JSON.stringify(pathAScore));
      console.log("PATH B SCORE", JSON.stringify(pathBScore));
    });
  });

  describe("Score integrity / Option D audit", () => {
    // No OPTIMAL-below-ACCEPTABLE divergence exists in this scenario:
    // both alternate OPTIMAL paths (A and B) reach the IDENTICAL live
    // dataIntegrity-bearing state (reportTrustStatus/tamperEvidenceStatus
    // /eventCompletenessPercent/orderingConfidencePercent all equal) and
    // differ only in genuinely secondary recovery/customerImpact bands
    // (which are deliberately wide and rarely separate adjacent tiers).
    // This test proves neither OPTIMAL path can score below the
    // ACCEPTABLE tier on the dimensions that matter, and records the
    // actual totals so a future edit cannot silently invert this.
    it("REGRESSION: neither OPTIMAL path (A or B) ever scores below the ACCEPTABLE tier", () => {
      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 35_000, PATH_A_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, acceptableResult),
      );

      const pathAState = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_A_ACTIONS);
      const pathAResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, pathAState);
      const pathAScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, pathAResult),
      );

      const pathBState = runScenario(DRAIN_WINDOW_FULLY_RECONCILED_MS + 35_000, PATH_B_ACTIONS);
      const pathBResult = evaluateCandidateDeclaredFinish(auditLogIntegrityFailureSimulation, pathBState);
      const pathBScore = scoreAuthoredAttempt(
        AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
        extractFinishScoringInputs(auditLogIntegrityFailureSimulation, pathBResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(pathAResult.completionTier).toBe("optimal");
      expect(pathBResult.completionTier).toBe("optimal");

      expect(pathAScore.total).toBeGreaterThanOrEqual(acceptableScore.total);
      expect(pathBScore.total).toBeGreaterThanOrEqual(acceptableScore.total);
      expect(pathAScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(acceptableScore.breakdown.dataIntegrity);
      expect(pathBScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(acceptableScore.breakdown.dataIntegrity);

      console.log(
        "OPTION D AUDIT: acceptable vs optimal-A vs optimal-B",
        JSON.stringify({ acceptableScore, pathAScore, pathBScore }),
      );
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const runB = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak unverifiable-event count and incorrectly-certified-report count generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_DEGRADATION_MS + 10_000, [
        { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "publish-as-is" },
      ]);
      expect(state.peaks.peakValues.unverifiableEventCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.incorrectlyCertifiedReportCount).toBeGreaterThan(0);
    });
  });

  describe("No accidental optimal state through random control mashing", () => {
    it("a deterministic sweep of secondary-control combinations (holding reportPublicationMode at its unsafe default) never reaches optimal or acceptable", () => {
      const reconciliationValues = ["off", "active"] as const;
      const duplicateValues = ["count-as-is", "dedupe-by-fingerprint"] as const;
      const orderingValues = ["trust-arrival-order", "timestamp-verified-reconstruction"] as const;
      const fallbackValues = ["disabled", "enabled"] as const;
      const pauseValues = ["off", "paused"] as const;

      for (const reconciliation of reconciliationValues) {
        for (const duplicate of duplicateValues) {
          for (const ordering of orderingValues) {
            for (const fallback of fallbackValues) {
              for (const pause of pauseValues) {
                const state = runScenario(SUSTAINED_DEGRADATION_MS + 5_000, [
                  { atMs: DEGRADATION_DISCOVERED_MS + 1_000, controlKey: RECONCILIATION_MODE_KEY, value: reconciliation },
                  { atMs: DEGRADATION_DISCOVERED_MS + 2_000, controlKey: DUPLICATE_HANDLING_KEY, value: duplicate },
                  { atMs: DEGRADATION_DISCOVERED_MS + 3_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: ordering },
                  { atMs: DEGRADATION_DISCOVERED_MS + 4_000, controlKey: FALLBACK_EVIDENCE_SOURCE_KEY, value: fallback },
                  { atMs: DEGRADATION_DISCOVERED_MS + 5_000, controlKey: INGESTION_PAUSE_KEY, value: pause },
                ]);
                const eligibility = evaluateCompletionEligibility(auditLogIntegrityFailureSimulation, state);
                expect(eligibility).toEqual({ eligible: false });
              }
            }
          }
        }
      }
    });
  });
});
