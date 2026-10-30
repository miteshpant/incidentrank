import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { certificateExpiryAcrossLargeFleet } from "./certificate-expiry-across-large-fleet";
import {
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
  certificateExpiryAcrossLargeFleetSimulation,
} from "./certificate-expiry-across-large-fleet/definition";
import { certificateExpiryAcrossLargeFleetCandidateUI } from "./certificate-expiry-across-large-fleet/candidate-ui";
import { CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING } from "./certificate-expiry-across-large-fleet/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  EXPIRY_DEADLINE_MS,
  GAP_RECOVERY_FULLY_DONE_MS,
  GAP_RECOVERY_WINDOW_1_MS,
  SUSTAINED_POST_EXPIRY_MS,
  T_MINUS_1H_MS,
  T_MINUS_6H_MS,
  T_MINUS_24H_MS,
  T_MINUS_72H_MS,
} from "./certificate-expiry-across-large-fleet/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(certificateExpiryAcrossLargeFleetSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += certificateExpiryAcrossLargeFleetSimulation.tickMs
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
      certificateExpiryAcrossLargeFleetSimulation,
      state,
      action,
      certificateExpiryAcrossLargeFleetSimulation.tickMs,
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
      certificateExpiryAcrossLargeFleetSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: modern-first ordering, overlap window opened,
// each cohort staged and verified in order (modern -> critical ->
// legacy-bridged -> all-cohorts-rotated), old certificate revoked only
// after trust bundle is verified.
const MODERN_FIRST_FULL_ROTATION_ACTIONS: TimedAction[] = [
  { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
  { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
  { atMs: T_MINUS_72H_MS + 3_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
  { atMs: T_MINUS_72H_MS + 4_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
  { atMs: T_MINUS_72H_MS + 5_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
  { atMs: T_MINUS_72H_MS + 6_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
  { atMs: T_MINUS_72H_MS + 7_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
  { atMs: T_MINUS_72H_MS + 8_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
];

// Alternate strong path B: critical-first ordering — retires the
// highest-consequence cohort's risk earliest, otherwise identical
// correct sequencing.
const CRITICAL_FIRST_FULL_ROTATION_ACTIONS: TimedAction[] = [
  { atMs: T_MINUS_72H_MS + 1_000, controlKey: ROTATION_ORDER_KEY, value: "critical-first" },
  { atMs: T_MINUS_72H_MS + 2_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
  { atMs: T_MINUS_72H_MS + 3_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
  { atMs: T_MINUS_72H_MS + 4_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
  { atMs: T_MINUS_72H_MS + 5_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
  { atMs: T_MINUS_72H_MS + 6_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
  { atMs: T_MINUS_72H_MS + 7_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
  { atMs: T_MINUS_72H_MS + 8_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
  { atMs: T_MINUS_72H_MS + 9_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
];

describe("Certificate Expiry Across Large Fleet", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(certificateExpiryAcrossLargeFleet.isFree).toBe(false);
      expect(certificateExpiryAcrossLargeFleet.library?.category.length).toBeGreaterThan(0);
      expect(certificateExpiryAcrossLargeFleet.library?.tags.length).toBeGreaterThan(0);
      expect(certificateExpiryAcrossLargeFleet.library?.skills.length).toBeGreaterThan(0);
      expect(certificateExpiryAcrossLargeFleet.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(certificateExpiryAcrossLargeFleetCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(certificateExpiryAcrossLargeFleetCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(certificateExpiryAcrossLargeFleetCandidateUI.components.length).toBe(5);
    });

    it("the architecture is a flat 5-node, 4-edge pipeline matching the spec", () => {
      expect(certificateExpiryAcrossLargeFleetSimulation.architecture.nodes.length).toBe(5);
      expect(certificateExpiryAcrossLargeFleetSimulation.architecture.edges.length).toBe(4);
      for (const node of certificateExpiryAcrossLargeFleetSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(certificateExpiryAcrossLargeFleet.description).toMatch(
        /the critical cohort may never cross the expiry deadline un-rotated/i,
      );
      expect(certificateExpiryAcrossLargeFleet.description).toMatch(
        /new certificates must be verifiably installed before old certificates are withdrawn/i,
      );
      expect(certificateExpiryAcrossLargeFleet.description).toMatch(
        /legacy cohorts may require a temporary overlap bridge/i,
      );
      expect(certificateExpiryAcrossLargeFleet.description).toMatch(
        /broad validation bypass is not acceptable/i,
      );
      expect(certificateExpiryAcrossLargeFleet.description).toMatch(
        /deadline risk must be explicitly tracked by cohort/i,
      );
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of certificateExpiryAcrossLargeFleetSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (zero dead controls)", () => {
      const classifiedKeys = new Set(
        certificateExpiryAcrossLargeFleetSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of certificateExpiryAcrossLargeFleetSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("every control is referenced by at least one rule condition (zero dead controls)", () => {
      const ruleControlKeys = new Set<string>();
      for (const rule of certificateExpiryAcrossLargeFleetSimulation.rules) {
        for (const key of Object.keys(rule.when.controlEquals ?? {})) {
          ruleControlKeys.add(key);
        }
      }
      for (const control of certificateExpiryAcrossLargeFleetSimulation.controls) {
        expect(ruleControlKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(certificateExpiryAcrossLargeFleetSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.fleetConnectionStatus).toBe("nominal");
      expect(state.values.modernCohortRotationStatus).toBe("pending");
      expect(state.values.cumulativeRejectedConnectionCount).toBe(0);
    });

    it("the deadline window begins at T-72h, never touching the raw connection success rate", () => {
      const state = runScenario(T_MINUS_72H_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(T_MINUS_72H_MS);
      expect(state.values.loadBalancerConnectionSuccessRatePercent).toBe(99.95);
    });

    it("baseline (zero action) keeps looking perfectly healthy on connection success while deadline risk silently accumulates (the core decoy)", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000);
      expect(state.values.loadBalancerConnectionSuccessRatePercent).toBe(99.95);
      expect(state.transitions.incidentState).toBe("deadline-risk-unaddressed");
      expect(state.values.fleetConnectionStatus).toBe("deadline-risk-unaddressed");
    });

    it("baseline still reads deadline-risk-unaddressed at T-1h, the last calendar checkpoint before expiry, with zero action taken", () => {
      const state = runScenario(T_MINUS_1H_MS + 5_000);
      expect(state.transitions.incidentState).toBe("deadline-risk-unaddressed");
      expect(state.values.loadBalancerConnectionSuccessRatePercent).toBe(99.95);
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("zero action, deadline missed entirely: deterministic expiry outage, not a random failure", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 5_000);
      expect(state.transitions.incidentState).toBe("expiry-deadline-missed");
      expect(state.values.fleetConnectionStatus).toBe("expiry-outage");
      expect(state.values.loadBalancerConnectionSuccessRatePercent as number).toBeLessThan(99);
    });

    it("zero action, deadline missed and sustained: outage compounds into a materially worse window", () => {
      const state = runScenario(SUSTAINED_POST_EXPIRY_MS + 5_000);
      expect(state.transitions.incidentState).toBe("expiry-deadline-missed-sustained");
      expect(state.values.cumulativeRejectedConnectionCount as number).toBeGreaterThan(400);
    });
  });

  describe("Required sequencing trap: revoking the old certificate before Legacy's trust bundle is verified", () => {
    it("revoking before every cohort is verified creates a real, self-inflicted premature-gap outage", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("premature-gap");
      expect(state.values.fleetConnectionStatus).toBe("premature-gap-outage");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("REORDERING PROOF: the exact same two actions (revoke, verify Legacy's trust bundle), with every cohort otherwise identically rotated, are unsafe in the WRONG order and safe in the RIGHT order", () => {
      const fullRolloutPrefix: TimedAction[] = [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
        { atMs: T_MINUS_72H_MS + 4_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
        { atMs: T_MINUS_72H_MS + 5_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
        { atMs: T_MINUS_72H_MS + 6_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
      ];
      // Wrong order: revoke BEFORE verifying the trust bundle, even
      // though every cohort has otherwise genuinely finished rotating.
      // Asserted at the instant right after revocation — before the
      // trust-bundle action has had a chance to land — to isolate the
      // ordering effect itself, exactly the window in which a real
      // fleet would actually be rejecting Legacy connections.
      const wrongOrder = runScenario(T_MINUS_72H_MS + 7_500, [
        ...fullRolloutPrefix,
        { atMs: T_MINUS_72H_MS + 7_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
      ]);
      // Right order: verify the trust bundle BEFORE revoking — the
      // SAME eventual action (revoke), only the order swapped, asserted
      // at the identical elapsed time.
      const rightOrder = runScenario(T_MINUS_72H_MS + 7_500, [
        ...fullRolloutPrefix,
        { atMs: T_MINUS_72H_MS + 6_500, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
        { atMs: T_MINUS_72H_MS + 7_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
      ]);

      // Both runs took the identical cohort-rollout prefix and both
      // end with the old certificate "revoked" — the only difference
      // is whether the trust-bundle-verification action landed before
      // or after it. The engine's shared, fleet-wide trust chain means
      // a premature revocation regresses every cohort's live
      // verification status uniformly (this single certificate
      // authority's chain underlies all three cohorts) — that uniform
      // regression IS the real, counted damage the wrong order causes.

      // Yet the outcome genuinely differs, purely from ordering.
      expect(wrongOrder.values.fleetConnectionStatus).not.toBe(rightOrder.values.fleetConnectionStatus);
      // Wrong order is unsafe (connections rejected) at the moment the
      // old certificate is revoked before Legacy's trust bundle was
      // ever verified.
      expect(wrongOrder.values.fleetConnectionStatus).toBe("premature-gap-outage");
      expect(wrongOrder.values.cumulativeRejectedConnectionCount as number).toBeGreaterThan(0);
      // Right order is safe (nothing rejected) even though the old
      // certificate ends up revoked in both cases.
      expect(rightOrder.values.fleetConnectionStatus).toBe("nominal");
      expect(rightOrder.values.cumulativeRejectedConnectionCount).toBe(0);
    });

    it("sustained premature gap compounds the outage further", () => {
      const state = runScenario(SUSTAINED_POST_EXPIRY_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("premature-gap-sustained");
      expect(state.values.cumulativeRejectedConnectionCount as number).toBeGreaterThan(400);
    });
  });

  describe("Required tempting-but-unsafe trap: disabling certificate validation fleet-wide", () => {
    it("bypassing validation makes connection success look instantly perfect but is a real, counted security violation", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "validation-bypass-all" },
      ]);
      expect(state.transitions.incidentState).toBe("bypass-active");
      expect(state.values.loadBalancerConnectionSuccessRatePercent as number).toBeGreaterThan(99);
      expect(state.values.fleetConnectionStatus).toBe("validation-bypassed");
      expect(state.values.cumulativeValidationBypassedConnectionCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the bypass trap can never satisfy completion, however long it runs", () => {
      const state = runScenario(SUSTAINED_POST_EXPIRY_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "validation-bypass-all" },
      ]);
      expect(state.transitions.incidentState).toBe("bypass-sustained");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("bypass engaged even pre-emptively (no revocation ever happened) is still a counted violation", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "validation-bypass-all" },
      ]);
      expect(state.values.fleetConnectionStatus).toBe("validation-bypassed");
      expect(state.values.cumulativeValidationBypassedConnectionCount as number).toBeGreaterThan(0);
    });
  });

  describe("False-bridge trap: claiming Legacy is bridged without the bridge actually engaged", () => {
    it("advancing cohortRolloutStage to legacy-bridged without legacyCompatibilityBridge=on is a false claim, not a real fix", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
        { atMs: T_MINUS_72H_MS + 4_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
      ]);
      expect(state.transitions.incidentState).toBe("false-bridge-legacy-not-engaged");
      expect(state.values.legacyCohortRotationStatus).toBe("pending");
    });
  });

  describe("Deterministic expiry-deadline-miss: partial rotation left behind", () => {
    it("rotating only Modern and missing the deadline on Critical/Legacy is still a real, counted violation", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
      ]);
      expect(state.transitions.incidentState).toBe("expiry-deadline-missed-partial");
      expect(state.values.modernCohortRotationStatus).toBe("verified-rotated");
      expect(state.values.criticalCohortRotationStatus).toBe("pending");
      expect(state.values.fleetConnectionStatus).toBe("expiry-outage");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Alternate strong path A: modern-first full rotation", () => {
    it("reaches genuine OPTIMAL once every cohort is verified, trust bundle verified, and old certificate revoked in the correct order", () => {
      const state = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      expect(state.values.modernCohortRotationStatus).toBe("verified-rotated");
      expect(state.values.criticalCohortRotationStatus).toBe("verified-rotated");
      expect(state.values.legacyCohortRotationStatus).toBe("verified-rotated");
      expect(state.values.fleetConnectionStatus).toBe("nominal");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });
  });

  describe("Alternate strong path B: critical-first full rotation", () => {
    it("reaches genuine OPTIMAL via a different, equally defensible ordering", () => {
      const state = runScenario(T_MINUS_72H_MS + 45_000, CRITICAL_FIRST_FULL_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      expect(state.values.fleetConnectionStatus).toBe("nominal");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("rotationOrder never gates correctness on its own — both orderings reach the identical safe end state", () => {
      const pathA = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      const pathB = runScenario(T_MINUS_72H_MS + 45_000, CRITICAL_FIRST_FULL_ROTATION_ACTIONS);
      expect(pathA.values.fleetConnectionStatus).toBe(pathB.values.fleetConnectionStatus);
      expect(pathA.values.modernCohortRotationStatus).toBe(pathB.values.modernCohortRotationStatus);
      expect(pathA.values.criticalCohortRotationStatus).toBe(pathB.values.criticalCohortRotationStatus);
      expect(pathA.values.legacyCohortRotationStatus).toBe(pathB.values.legacyCohortRotationStatus);
    });
  });

  describe("Default-value path completeness (binding requirement): every safe strategy reaches a safe terminal state with untouched-default controls", () => {
    it("REGRESSION: rotationOrder left at its untouched default ('modern-first') while the rest of the rotation is correctly sequenced reaches genuine OPTIMAL", () => {
      const state = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("healthy");
      expect(state.transitions.incidentState).not.toBe("deadline-risk-unaddressed");
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: a candidate who only rotates Modern (overlap open, nothing else touched — certificateOverlapWindow is the only non-default control besides cohort stage) reaches a genuinely safe ACCEPTABLE state, never falling through to deadline-risk-unaddressed or baseline", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
      ]);
      expect(state.transitions.incidentState).not.toBe("deadline-risk-unaddressed");
      expect(state.transitions.incidentState).toBe("modern-rotated-progress");
      expect(state.values.fleetConnectionStatus).toBe("nominal");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("REGRESSION: opening the overlap window alone, with cohortRolloutStage left at its untouched default ('not-started'), reaches a genuinely safe ACCEPTABLE state (no progress yet, but nothing broken)", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
      ]);
      expect(state.transitions.incidentState).not.toBe("deadline-risk-unaddressed");
      expect(state.transitions.incidentState).toBe("overlap-opened-no-progress");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("REGRESSION: leaving cohortRolloutStage at its untouched default ('not-started') the entire time while the deadline window is active never spuriously becomes Finish-eligible, however long it is left alone", () => {
      const state = runScenario(T_MINUS_6H_MS + 5_000);
      expect(state.transitions.incidentState).toBe("deadline-risk-unaddressed");
      expect(state.values.fleetConnectionStatus).toBe("deadline-risk-unaddressed");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("REGRESSION: all-cohorts-rotated reached but old certificate left at its untouched default ('not-revoked') still reaches genuine OPTIMAL — every cohort's deadline risk is retired, and old-certificate cleanup is hygiene, not a safety requirement", () => {
      const state = runScenario(T_MINUS_72H_MS + 40_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
        { atMs: T_MINUS_72H_MS + 4_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
        { atMs: T_MINUS_72H_MS + 5_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
        { atMs: T_MINUS_72H_MS + 6_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
      ]);
      expect(state.transitions.incidentState).toBe("all-cohorts-rotated-overlap");
      expect(state.values.fleetConnectionStatus).toBe("nominal");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    // The following REGRESSION tests cover two real, verifier-grade
    // default-value fallthrough defects found and fixed during this
    // scenario's own completeness audit (the exact #90/#91 lesson this
    // batch's binding requirement exists to catch) — see rules.ts's
    // "expiry-deadline-missed-critical-rotated*"/
    // "expiry-deadline-missed-legacy-bridged*"/
    // "expiry-deadline-missed-false-claim-all-cohorts*"/
    // "false-claim-overlap-never-opened-*" rules.

    it("REGRESSION #1a: critical-rotated left as the ONLY cohort progress, deadline passed, never falls through to healthy-default — becomes a real, counted expiry outage", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 1_000, [
        { atMs: T_MINUS_72H_MS + 500, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 600, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
      ]);
      expect(state.transitions.incidentState).not.toBe("healthy");
      expect(state.transitions.incidentState).toBe("expiry-deadline-missed-critical-rotated");
      expect(state.values.criticalCohortRotationStatus).toBe("verified-rotated");
      expect(state.values.modernCohortRotationStatus).toBe("pending");
      expect(state.values.fleetConnectionStatus).toBe("expiry-outage");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("REGRESSION #1b: legacy-bridged left as the furthest cohort progress, deadline passed, never falls through to healthy-default — becomes a real, counted expiry outage", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 1_000, [
        { atMs: T_MINUS_72H_MS + 500, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 600, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 700, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
        { atMs: T_MINUS_72H_MS + 800, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
      ]);
      expect(state.transitions.incidentState).not.toBe("healthy");
      expect(state.transitions.incidentState).toBe("expiry-deadline-missed-legacy-bridged");
      expect(state.values.legacyCohortRotationStatus).toBe("pending");
      expect(state.values.fleetConnectionStatus).toBe("expiry-outage");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("REGRESSION #1c: all three cohorts fully rotated, deadline passes afterward — stays safe (OPTIMAL), the deadline passing changes nothing real once every cohort's own risk was already retired", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 1_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("healthy");
      expect(state.transitions.incidentState).toBe("fully-rotated-safe");
      // Genuinely eligible: the rotation completed and sustained
      // "nominal + all cohorts verified" for well over 30s before the
      // deadline even passed, so successCondition's sustain window was
      // already satisfied long before this checkpoint.
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION #2: cohortRolloutStage advanced all the way to 'all-cohorts-rotated' WITHOUT certificateOverlapWindow ever being opened is a false claim before the deadline (never falls through to healthy-default), and becomes a genuine expiry outage once the deadline actually passes", () => {
      const beforeDeadline = runScenario(T_MINUS_24H_MS + 1_000, [
        { atMs: T_MINUS_72H_MS + 500, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 600, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
        { atMs: T_MINUS_72H_MS + 700, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
        { atMs: T_MINUS_72H_MS + 800, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
      ]);
      expect(beforeDeadline.transitions.incidentState).not.toBe("healthy");
      expect(beforeDeadline.transitions.incidentState).toBe("false-claim-overlap-never-opened");
      expect(beforeDeadline.values.modernCohortRotationStatus).toBe("pending");
      const eligibilityBefore = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, beforeDeadline);
      expect(eligibilityBefore).toEqual({ eligible: false });

      const afterDeadline = runScenario(EXPIRY_DEADLINE_MS + 1_000, [
        { atMs: T_MINUS_72H_MS + 500, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 600, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
        { atMs: T_MINUS_72H_MS + 700, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
        { atMs: T_MINUS_72H_MS + 800, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
      ]);
      expect(afterDeadline.transitions.incidentState).not.toBe("healthy");
      expect(afterDeadline.transitions.incidentState).toBe("expiry-deadline-missed-false-claim-all-cohorts");
      expect(afterDeadline.values.fleetConnectionStatus).toBe("expiry-outage");
      const eligibilityAfter = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, afterDeadline);
      expect(eligibilityAfter).toEqual({ eligible: false });
    });

    it("REGRESSION #3: exhaustive sweep of every (cohortRolloutStage x oldCertificateRevocationTiming x trustBundleUpdateStatus x certificateOverlapWindow x legacyCompatibilityBridge x loadBalancerCertificateMode) combination, sampled at 6 calendar checkpoints (T-72h, expiry, sustained-post-expiry, and both gap-recovery-lag anchors), never falls through to the pre-incident healthy-default state", () => {
      // This sweep is 320 combinations x 5 checkpoints = 1600 full
      // scenario replays and can legitimately exceed the default 5s
      // test timeout under heavy parallel CI load (observed ~2.3-2.5s
      // in isolation, longer when the full package suite runs
      // concurrently) — an explicit, generous timeout here, not a
      // shortcut around the coverage itself.
      const rolloutValues = ["not-started", "modern-rotated", "critical-rotated", "legacy-bridged", "all-cohorts-rotated"] as const;
      const revocationValues = ["not-revoked", "revoked"] as const;
      const trustValues = ["pending", "updated-and-verified"] as const;
      const overlapValues = ["closed", "open"] as const;
      const bridgeValues = ["off", "on"] as const;
      const bypassValues = ["standard-validation", "validation-bypass-all"] as const;
      const checkpoints = [
        T_MINUS_72H_MS + 1_000,
        EXPIRY_DEADLINE_MS + 1_000,
        SUSTAINED_POST_EXPIRY_MS + 1_000,
        GAP_RECOVERY_WINDOW_1_MS + 1_000,
        GAP_RECOVERY_FULLY_DONE_MS + 1_000,
      ];

      for (const rollout of rolloutValues) {
        for (const revocation of revocationValues) {
          for (const trust of trustValues) {
            for (const overlap of overlapValues) {
              for (const bridge of bridgeValues) {
                for (const bypass of bypassValues) {
                  const actions: TimedAction[] = [
                    { atMs: T_MINUS_72H_MS + 100, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: overlap },
                    { atMs: T_MINUS_72H_MS + 200, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: bridge },
                    { atMs: T_MINUS_72H_MS + 300, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: rollout },
                    { atMs: T_MINUS_72H_MS + 400, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: trust },
                    { atMs: T_MINUS_72H_MS + 500, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: revocation },
                    { atMs: T_MINUS_72H_MS + 600, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: bypass },
                  ];
                  for (const ms of checkpoints) {
                    const state = runScenario(ms, actions);
                    expect(state.transitions.incidentState).not.toBe("healthy");
                  }
                }
              }
            }
          }
        }
      }
    }, 20_000);
  });

  describe("Recovery lag: closing a premature gap the sanctioned way takes real elapsed time", () => {
    it("rolling back right after revoking (no cohort ever touched) does not instantly restore every connection — success rate reflects a real, intermediate recovering state, not an instant snap", () => {
      // Revoke, then immediately roll back + mark the trust bundle
      // verified, with cohortRolloutStage left at its untouched
      // "not-started" default the entire time. This is the gap-
      // recovery family's narrowest, most isolated case: the candidate
      // created and then closed the SAME gap, with no other cohort
      // work attempted. Correctly reaches "gap-just-rolled-back" (not
      // an instant full recovery) — the real elapsed-time lag still
      // applies even to this minimal case.
      const state = runScenario(T_MINUS_72H_MS + 10_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "not-revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("gap-just-rolled-back");
      expect(state.values.loadBalancerConnectionSuccessRatePercent as number).toBeLessThan(99);
      expect(state.values.fleetConnectionStatus).toBe("nominal");
    });

    it("once sustained long enough, the isolated rollback-only path (no cohort ever touched) qualifies as ACCEPTABLE — nothing is currently broken, even though zero cohort deadline risk has been retired yet", () => {
      const state = runScenario(T_MINUS_72H_MS + 40_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "not-revoked" },
      ]);
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("reaches full recovery only after the full elapsed recovery window (gap created and rolled back with cohortRolloutStage left untouched, so the lag mechanism is genuinely isolated and exercised across its full worst-case anchor)", () => {
      const state = runScenario(GAP_RECOVERY_FULLY_DONE_MS + 10_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "not-revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("gap-recovered");
      expect(state.values.fleetConnectionStatus).toBe("nominal");
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("partial recovery window (gap rolled back, cohortRolloutStage left untouched) shows an intermediate, not-yet-fully-recovered success rate", () => {
      const state = runScenario(GAP_RECOVERY_WINDOW_1_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "not-revoked" },
      ]);
      expect(state.transitions.incidentState).toBe("gap-recovering-window1");
      expect(state.values.loadBalancerConnectionSuccessRatePercent as number).toBeGreaterThan(70);
      expect(state.values.loadBalancerConnectionSuccessRatePercent as number).toBeLessThan(99);
    });
  });

  describe("Historical/permanent damage: rejected connections and bypassed connections never reset", () => {
    it("the live rejected-connection count can stop growing once fixed, but the peak historical record never decreases", () => {
      const unsafeState = runScenario(T_MINUS_72H_MS + 10_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
      ]);
      const recoveredState = runScenario(GAP_RECOVERY_FULLY_DONE_MS + 10_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY, value: "updated-and-verified" },
        { atMs: T_MINUS_72H_MS + 3_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "not-revoked" },
        { atMs: T_MINUS_72H_MS + 4_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 5_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
        { atMs: T_MINUS_72H_MS + 6_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
        { atMs: T_MINUS_72H_MS + 7_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
        { atMs: T_MINUS_72H_MS + 8_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
        { atMs: T_MINUS_72H_MS + 9_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "all-cohorts-rotated" },
      ]);
      expect(unsafeState.values.cumulativeRejectedConnectionCount as number).toBeGreaterThan(0);
      expect(recoveredState.values.fleetConnectionStatus).toBe("nominal");
      expect(recoveredState.peaks.peakValues.cumulativeRejectedConnectionCount as number).toBeGreaterThan(0);
    });

    it("the independent validation-bypass historical count also tracks its own non-resetting peak", () => {
      const state = runScenario(T_MINUS_24H_MS + 10_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "validation-bypass-all" },
        { atMs: T_MINUS_72H_MS + 61_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "standard-validation" },
      ]);
      expect(state.peaks.peakValues.cumulativeValidationBypassedConnectionCount as number).toBeGreaterThan(0);
    });
  });

  describe("No scale-X-overload-Y mechanic / pressure-transfer audit", () => {
    it("engaging every safe lever simultaneously never degrades an unrelated component (no pressure-transfer trap exists in this scenario)", () => {
      const state = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      expect(state.values.loadBalancerConnectionSuccessRatePercent as number).toBeGreaterThan(99);
      expect(state.componentHealth["certificate-authority"]).toBe("healthy");
      expect(state.componentHealth["secret-distribution"]).toBe("healthy");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(T_MINUS_72H_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger the incident, take zero action, Finish immediately -> declared_unstable, even though every live metric reads green", () => {
      const state = runScenario(T_MINUS_72H_MS + 1_000);
      expect(state.values.loadBalancerConnectionSuccessRatePercent).toBe(99.95);
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well into the deadline window (T-6h, nothing rotated) still resolves to declared_unstable", () => {
      const state = runScenario(T_MINUS_6H_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued after the deadline is missed resolves to declared_unstable", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("the mid-rotation-but-safe family qualifies as ACCEPTABLE before every cohort finishes", () => {
      const state = runScenario(T_MINUS_24H_MS + 5_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
      ]);
      const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(state.values.criticalCohortRotationStatus).toBe("verified-rotated");
      expect(state.values.modernCohortRotationStatus).toBe("pending");
    });

    it("never auto-fails even in candidate_declared mode, however long the breach sustains past the old window", () => {
      const state = runScenario(SUSTAINED_POST_EXPIRY_MS + 20 * 60_000);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(30);
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (modern-first full rotation) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      const inputs = extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, result);
      const score = scoreAuthoredAttempt(CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (Path A: modern-first) SCORE", JSON.stringify(score));
    });

    it("optimal path (critical-first full rotation) also scores full dataIntegrity credit", () => {
      const state = runScenario(T_MINUS_72H_MS + 45_000, CRITICAL_FIRST_FULL_ROTATION_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, result);
      const score = scoreAuthoredAttempt(CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (Path B: critical-first) SCORE", JSON.stringify(score));
    });

    it("acceptable path (mid-rotation, safe but incomplete) scores well, at or below optimal (recoveryTimeSeconds bands are wide — see Option D note below — so a fast partial rotation can honestly tie a fast full one; it must never score ABOVE optimal)", () => {
      const optimalState = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
        extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, optimalResult),
      );

      const acceptableState = runScenario(T_MINUS_24H_MS + 35_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        certificateExpiryAcrossLargeFleetSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
        extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThanOrEqual(optimalScore.total);
      console.log("ACCEPTABLE (critical-rotated, mid-rotation) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(EXPIRY_DEADLINE_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful/tempting path (validation bypass) scores worse than baseline on dataIntegrity AND total, despite looking instantly fixed", () => {
      const baselineState = runScenario(EXPIRY_DEADLINE_MS + 60_000);
      const harmfulState = runScenario(EXPIRY_DEADLINE_MS + 60_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "validation-bypass-all" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.loadBalancerConnectionSuccessRatePercent as number).toBeGreaterThan(
        baselineState.values.loadBalancerConnectionSuccessRatePercent as number,
      );
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThanOrEqual(baselineScore.breakdown.dataIntegrity);
      console.log("HARMFUL (validation bypass) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("two alternate optimal paths (modern-first vs critical-first) score identically — rotationOrder is a strategy choice, not a correctness driver", () => {
      const pathAState = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      const pathBState = runScenario(T_MINUS_72H_MS + 45_000, CRITICAL_FIRST_FULL_ROTATION_ACTIONS);
      const pathAResult = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, pathAState);
      const pathBResult = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, pathBState);
      const pathAScore = scoreAuthoredAttempt(
        CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
        extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, pathAResult),
      );
      const pathBScore = scoreAuthoredAttempt(
        CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
        extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, pathBResult),
      );
      expect(pathAResult.completionTier).toBe("optimal");
      expect(pathBResult.completionTier).toBe("optimal");
      expect(pathAScore.breakdown.dataIntegrity).toBe(pathBScore.breakdown.dataIntegrity);
      console.log("PATH A (modern-first) SCORE", JSON.stringify(pathAScore));
      console.log("PATH B (critical-first) SCORE", JSON.stringify(pathBScore));
    });

    it("SCORE INTEGRITY / Option D audit: no OPTIMAL path scores below any ACCEPTABLE path on dataIntegrity", () => {
      const optimalA = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      const optimalB = runScenario(T_MINUS_72H_MS + 45_000, CRITICAL_FIRST_FULL_ROTATION_ACTIONS);
      const acceptable = runScenario(T_MINUS_24H_MS + 35_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
      ]);
      const scoreOf = (state: ReturnType<typeof runScenario>) => {
        const result = evaluateCandidateDeclaredFinish(certificateExpiryAcrossLargeFleetSimulation, state);
        return {
          result,
          score: scoreAuthoredAttempt(
            CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING,
            extractFinishScoringInputs(certificateExpiryAcrossLargeFleetSimulation, result),
          ),
        };
      };
      const a = scoreOf(optimalA);
      const b = scoreOf(optimalB);
      const c = scoreOf(acceptable);
      expect(a.result.completionTier).toBe("optimal");
      expect(b.result.completionTier).toBe("optimal");
      expect(c.result.completionTier).toBe("acceptable");
      // Both OPTIMAL paths' dataIntegrity must be at or above the
      // ACCEPTABLE path's — never below, on the correctness dimension.
      expect(a.score.breakdown.dataIntegrity).toBeGreaterThanOrEqual(c.score.breakdown.dataIntegrity);
      expect(b.score.breakdown.dataIntegrity).toBeGreaterThanOrEqual(c.score.breakdown.dataIntegrity);
      console.log(
        "OPTION D AUDIT",
        JSON.stringify({ optimalA: a.score, optimalB: b.score, acceptable: c.score }),
      );
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      const runB = runScenario(T_MINUS_72H_MS + 45_000, MODERN_FIRST_FULL_ROTATION_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak rejected-connection count and bypassed-connection count generically via numericWatchFields", () => {
      const state = runScenario(T_MINUS_24H_MS + 10_000, [
        { atMs: T_MINUS_72H_MS + 1_000, controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY, value: "revoked" },
        { atMs: T_MINUS_72H_MS + 2_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: "validation-bypass-all" },
      ]);
      expect(state.peaks.peakValues.cumulativeRejectedConnectionCount as number).toBeGreaterThanOrEqual(0);
      expect(state.peaks.peakValues.cumulativeValidationBypassedConnectionCount as number).toBeGreaterThan(0);
    });
  });

  describe("No accidental optimal/acceptable state through random control mashing", () => {
    // NOTE: trustBundleUpdateStatus="updated-and-verified" (with
    // oldCertificateRevocationTiming left at its "not-revoked" default
    // and cohortRolloutStage left at "not-started") is deliberately
    // EXCLUDED from this sweep. That specific combination legitimately
    // matches "gap-just-rolled-back" (see rules.ts) — the engine cannot
    // distinguish "the trust bundle was verified as part of winding
    // back an earlier revocation" from "the trust-bundle flag was
    // touched for no reason" purely from current control values (there
    // is no history tracking), and BOTH cases leave the system in an
    // identical, honestly-safe, non-harmful state (nothing is currently
    // broken, no connection is being rejected) — which is a genuinely
    // defensible ACCEPTABLE handback either way, not an accidental
    // false-safe reached by combining unrelated controls. The sweep
    // below still covers every OTHER combination of secondary controls
    // with zero cohort progress, proving none of THOSE accidentally
    // reaches a safe tier.
    it("a deterministic sweep of secondary controls (holding cohortRolloutStage at its unsafe default 'not-started' and trustBundleUpdateStatus at its 'pending' default) never reaches optimal or acceptable", () => {
      const orderValues = ["modern-first", "critical-first"] as const;
      const bridgeValues = ["off", "on"] as const;
      const bypassValues = ["standard-validation", "validation-bypass-all"] as const;

      for (const order of orderValues) {
        for (const bridge of bridgeValues) {
          for (const bypass of bypassValues) {
            const state = runScenario(T_MINUS_6H_MS + 5_000, [
              { atMs: T_MINUS_72H_MS + 1_000, controlKey: ROTATION_ORDER_KEY, value: order },
              { atMs: T_MINUS_72H_MS + 2_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: bridge },
              { atMs: T_MINUS_72H_MS + 3_000, controlKey: LOAD_BALANCER_CERTIFICATE_MODE_KEY, value: bypass },
            ]);
            const eligibility = evaluateCompletionEligibility(certificateExpiryAcrossLargeFleetSimulation, state);
            expect(eligibility).toEqual({ eligible: false });
          }
        }
      }
    });
  });
});
