import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { privilegeEscalationViaStaleAuthorizationCache } from "./privilege-escalation-via-stale-authorization-cache";
import {
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
  privilegeEscalationViaStaleAuthorizationCacheSimulation,
} from "./privilege-escalation-via-stale-authorization-cache/definition";
import { privilegeEscalationViaStaleAuthorizationCacheCandidateUI } from "./privilege-escalation-via-stale-authorization-cache/candidate-ui";
import { PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING } from "./privilege-escalation-via-stale-authorization-cache/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  CONVERGENCE_FULLY_DONE_MS,
  CONVERGENCE_WINDOW_1_MS,
  CONVERGENCE_WINDOW_2_MS,
  PASSIVE_CONVERGENCE_FULLY_DONE_MS,
  PASSIVE_CONVERGENCE_WINDOW_1_MS,
  REVOCATION_ONSET_MS,
  SUSTAINED_UNCONVERGED_MS,
} from "./privilege-escalation-via-stale-authorization-cache/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(privilegeEscalationViaStaleAuthorizationCacheSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += privilegeEscalationViaStaleAuthorizationCacheSimulation.tickMs
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
      privilegeEscalationViaStaleAuthorizationCacheSimulation,
      state,
      action,
      privilegeEscalationViaStaleAuthorizationCacheSimulation.tickMs,
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
      privilegeEscalationViaStaleAuthorizationCacheSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path #1: push-based invalidation + verify-before-trust.
const SAFE_PUSH_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_INVALIDATION_MODE_KEY, value: "immediate" },
  { atMs: SUSTAINED_UNCONVERGED_MS + 2_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
];

// Alternate strong path #2: targeted-purge-based + verify-before-trust.
const SAFE_TARGETED_PURGE_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_PURGE_SCOPE_KEY, value: "targeted" },
  { atMs: SUSTAINED_UNCONVERGED_MS + 2_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
];

describe("Privilege Escalation via Stale Authorization Cache", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(privilegeEscalationViaStaleAuthorizationCache.isFree).toBe(false);
      expect(privilegeEscalationViaStaleAuthorizationCache.library?.category).toBe("Security & Identity");
      expect(privilegeEscalationViaStaleAuthorizationCache.library?.tags.length).toBeGreaterThan(0);
      expect(privilegeEscalationViaStaleAuthorizationCache.library?.skills.length).toBeGreaterThan(0);
      expect(privilegeEscalationViaStaleAuthorizationCache.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(privilegeEscalationViaStaleAuthorizationCacheCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(privilegeEscalationViaStaleAuthorizationCacheCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(privilegeEscalationViaStaleAuthorizationCacheCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 nodes and 6 edges matching the spec, flat (no nesting)", () => {
      expect(privilegeEscalationViaStaleAuthorizationCacheSimulation.architecture.nodes.length).toBe(6);
      expect(privilegeEscalationViaStaleAuthorizationCacheSimulation.architecture.edges.length).toBe(6);
      for (const node of privilegeEscalationViaStaleAuthorizationCacheSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all four business invariants plus the distinct security invariant", () => {
      expect(privilegeEscalationViaStaleAuthorizationCache.description).toMatch(
        /revoked privilege must stop being honored/i,
      );
      expect(privilegeEscalationViaStaleAuthorizationCache.description).toMatch(/fail-closed .* is the safe default/i);
      expect(privilegeEscalationViaStaleAuthorizationCache.description).toMatch(
        /broadly disabling authorization checks to restore availability is never acceptable/i,
      );
      expect(privilegeEscalationViaStaleAuthorizationCache.description).toMatch(
        /must be recorded and must not be erased/i,
      );
      expect(privilegeEscalationViaStaleAuthorizationCache.description).toMatch(
        /must never be granted access based on a privilege that has already been revoked/i,
      );
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of privilegeEscalationViaStaleAuthorizationCacheSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it", () => {
      const classifiedKeys = new Set(
        privilegeEscalationViaStaleAuthorizationCacheSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of privilegeEscalationViaStaleAuthorizationCacheSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(privilegeEscalationViaStaleAuthorizationCacheSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.staleGrantRatePercent).toBe(0);
      expect(state.values.cumulativeStalePrivilegeGrantCount).toBe(0);
    });

    it("revocation onset triggers the incident with unconverged caches, never a stale grant by itself", () => {
      const state = runScenario(REVOCATION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(REVOCATION_ONSET_MS);
      expect(state.values.cacheConvergencePercent as number).toBeLessThan(100);
      expect(state.values.staleGrantRatePercent).toBe(0);
      expect(state.values.cumulativeStalePrivilegeGrantCount).toBe(0);
    });

    it("baseline (no action) leaves the fleet unconverged and never produces a stale grant", () => {
      const state = runScenario(REVOCATION_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("fail-closed-baseline");
      expect(state.values.cacheConvergencePercent as number).toBeLessThan(100);
      expect(state.values.staleGrantRatePercent).toBe(0);
    });

    it("leaving the fleet unconverged long enough reaches the sustained baseline, requestSuccessRate stays near its ceiling throughout (decoy signal)", () => {
      const early = runScenario(REVOCATION_ONSET_MS + 5_000);
      const sustained = runScenario(SUSTAINED_UNCONVERGED_MS + 5_000);
      expect(sustained.transitions.incidentState).toBe("fail-closed-baseline-sustained");
      expect(sustained.values.requestSuccessRate as number).toBeGreaterThan(98);
      expect(early.values.requestSuccessRate as number).toBeGreaterThan(98);
    });
  });

  describe("Required security-vs-availability trap: fail-open creates real, nonzero stale grants", () => {
    it("fail-open improves/matches availability but creates real, nonzero stale privilege grants", () => {
      const baseline = runScenario(REVOCATION_ONSET_MS + 10_000);
      const failOpen = runScenario(REVOCATION_ONSET_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      expect(failOpen.transitions.incidentState).toBe("fail-open-stale-grant");
      // Availability is at least as good as baseline (it never gets
      // WORSE under fail-open — that is precisely the trap).
      expect(failOpen.values.requestSuccessRate as number).toBeGreaterThanOrEqual(
        baseline.values.requestSuccessRate as number,
      );
      // But a stale grant is now real and nonzero.
      expect(failOpen.values.staleGrantRatePercent as number).toBeGreaterThan(0);
      expect(failOpen.values.cumulativeStalePrivilegeGrantCount as number).toBeGreaterThan(0);
      expect(failOpen.values.authorizationStatus).toBe("stale-grant-active");
    });

    it("fail-open held through the sustained window compounds the stale-grant count further", () => {
      const early = runScenario(REVOCATION_ONSET_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      const sustained = runScenario(SUSTAINED_UNCONVERGED_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      expect(sustained.transitions.incidentState).toBe("fail-open-stale-grant-sustained");
      expect(sustained.values.cumulativeStalePrivilegeGrantCount as number).toBeGreaterThan(
        early.values.cumulativeStalePrivilegeGrantCount as number,
      );
    });

    it("fail-open can never be Finish-eligible, however long it runs", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 60_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const finish = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });

    it("sustained fail-open eventually reaches automatic failure regardless of other metrics", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 6 * 60_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
      const finish = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");
    });
  });

  describe("Security QA (section 11): fail-open cannot be laundered into a safe outcome", () => {
    it("switching back to fail-closed stops NEW stale grants but the peak historical count never decreases", () => {
      const sealedUnsafeState = runScenario(SUSTAINED_UNCONVERGED_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      const correctedState = runScenario(SUSTAINED_UNCONVERGED_MS + 20_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
        { atMs: SUSTAINED_UNCONVERGED_MS + 11_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-closed" },
      ]);
      expect(sealedUnsafeState.values.staleGrantRatePercent as number).toBeGreaterThan(0);
      expect(correctedState.values.staleGrantRatePercent).toBe(0);
      // Live grants stopped (the live field answers "is a stale grant
      // happening RIGHT NOW"), but the peak historical record never
      // decreases once it has peaked.
      expect(correctedState.peaks.peakValues.cumulativeStalePrivilegeGrantCount as number).toBeGreaterThanOrEqual(
        sealedUnsafeState.values.cumulativeStalePrivilegeGrantCount as number,
      );
    });

    it("full remediation after an unsafe fail-open window reaches OPTIMAL on every live metric while the peak historical record permanently shows the violation", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
        { atMs: REVOCATION_ONSET_MS + 2_000, controlKey: CACHE_INVALIDATION_MODE_KEY, value: "immediate" },
        { atMs: REVOCATION_ONSET_MS + 3_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
        { atMs: REVOCATION_ONSET_MS + 4_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-closed" },
      ]);
      expect(state.transitions.incidentState).toBe("converged-safe");
      // Live correctness is fully safe right now.
      expect(state.values.staleGrantRatePercent).toBe(0);
      expect(state.values.cumulativeStalePrivilegeGrantCount).toBe(0);
      expect(state.values.cacheConvergencePercent).toBe(100);
      expect(state.values.fleetCacheConvergenceStatus).toBe("converged");
      expect(state.values.enforcementPosture).toBe("fail-closed");
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the earlier fail-open window
      // this attempt passed through.
      expect(state.peaks.peakValues.cumulativeStalePrivilegeGrantCount as number).toBeGreaterThan(0);
      // This state is still Finish-eligible as optimal: the CURRENT
      // configuration is genuinely safe, even though its history is
      // not clean.
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Second unsafe path: broad-trust-all purge", () => {
    it("broad-trust-all alone (fail-closed) regresses convergence vs. doing nothing, with zero live violation", () => {
      const baselineState = runScenario(REVOCATION_ONSET_MS + 10_000);
      const broadTrustState = runScenario(REVOCATION_ONSET_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CACHE_PURGE_SCOPE_KEY, value: "broad-trust-all" },
      ]);
      expect(broadTrustState.transitions.incidentState).toBe("broad-trust-all-reintroduces-staleness");
      expect(broadTrustState.values.staleGrantRatePercent).toBe(0);
      expect(broadTrustState.values.cacheConvergencePercent as number).toBeLessThan(
        baselineState.values.cacheConvergencePercent as number,
      );
    });

    it("broad-trust-all compounded with fail-open is strictly worse than fail-open alone", () => {
      const failOpenOnly = runScenario(REVOCATION_ONSET_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      const compounded = runScenario(REVOCATION_ONSET_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
        { atMs: REVOCATION_ONSET_MS + 2_000, controlKey: CACHE_PURGE_SCOPE_KEY, value: "broad-trust-all" },
      ]);
      expect(compounded.transitions.incidentState).toBe("broad-trust-all-fail-open-compounded");
      expect(compounded.values.cumulativeStalePrivilegeGrantCount as number).toBeGreaterThan(
        failOpenOnly.values.cumulativeStalePrivilegeGrantCount as number,
      );
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, compounded);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Sequencing trap: assumed-converged vs. verified-converged", () => {
    it("leaving convergence unverified after a plausible amount of elapsed time is never Finish-eligible, even with zero live violations", () => {
      const state = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000);
      expect(state.transitions.incidentState).toBe("assumed-converged-unverified");
      expect(state.values.staleGrantRatePercent).toBe(0);
      expect(state.values.cumulativeStalePrivilegeGrantCount).toBe(0);
      expect(state.values.cacheConvergencePercent as number).toBeLessThan(100);
      expect(state.values.fleetCacheConvergenceStatus).toBe("unverified");
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("engaging verify-before-trust at the same elapsed time reaches a materially different (converging, not unverified) status", () => {
      const unverified = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000);
      const verified = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000, [
        { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
      ]);
      expect(unverified.values.fleetCacheConvergenceStatus).toBe("unverified");
      expect(verified.values.fleetCacheConvergenceStatus).toBe("converging");
      expect(verified.transitions.incidentState).toBe("converging-window2");
    });
  });

  describe("Recovery lag: cache convergence climbs only over real elapsed time", () => {
    it("immediately after engaging a propagation lever, convergence has not yet moved past the trap value", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 4_000, [
        { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_INVALIDATION_MODE_KEY, value: "immediate" },
        { atMs: SUSTAINED_UNCONVERGED_MS + 2_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
      ]);
      expect(state.values.cacheConvergencePercent as number).toBeLessThan(100);
    });

    it("convergence window 1 shows real, partial progress above the unconverged trap", () => {
      const state = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_PUSH_ACTIONS);
      expect(state.transitions.incidentState).toBe("converging-window1");
      expect(state.values.cacheConvergencePercent).toBe(68);
    });

    it("convergence window 2 shows further progress than window 1", () => {
      const window1 = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_PUSH_ACTIONS);
      const window2 = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000, SAFE_PUSH_ACTIONS);
      expect(window2.transitions.incidentState).toBe("converging-window2");
      expect(window2.values.cacheConvergencePercent as number).toBeGreaterThan(
        window1.values.cacheConvergencePercent as number,
      );
    });

    it("only after the full convergence window AND verification does convergence reach genuine OPTIMAL", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      expect(state.values.cacheConvergencePercent).toBe(100);
      expect(state.values.fleetCacheConvergenceStatus).toBe("converged");
    });

    it("passive TTL-only convergence (no active invalidation/purge) is real but much slower, proving cacheTtlSeconds is not a dead control", () => {
      const shortTtlState = runScenario(PASSIVE_CONVERGENCE_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_TTL_SECONDS_KEY, value: 30 },
      ]);
      expect(shortTtlState.transitions.incidentState).toBe("passive-converging-short-ttl");
      expect(shortTtlState.values.cacheConvergencePercent).toBe(70);

      const longTtlFullyDone = runScenario(PASSIVE_CONVERGENCE_FULLY_DONE_MS + 35_000);
      expect(longTtlFullyDone.transitions.incidentState).toBe("passive-converged-long-ttl");
      expect(longTtlFullyDone.values.cacheConvergencePercent).toBe(97);
      // Still, even at full passive elapsed time, long-TTL passive
      // convergence (97) never quite reaches the active-propagation
      // path's full 100 within the same real-time budget used for
      // active invalidation — proving active invalidation/purge (and
      // short TTL) are real accelerants, not merely cosmetic.
      const eligibility = evaluateCompletionEligibility(
        privilegeEscalationViaStaleAuthorizationCacheSimulation,
        longTtlFullyDone,
      );
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Legitimate degraded-but-safe state: source-of-truth-required", () => {
    it("guarantees zero stale grants at a real, deliberate availability cost", () => {
      const state = runScenario(REVOCATION_ONSET_MS + 40_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: POLICY_STORE_READ_MODE_KEY, value: "source-of-truth-required" },
      ]);
      expect(state.transitions.incidentState).toBe("safe-degraded-source-of-truth-required");
      expect(state.values.staleGrantRatePercent).toBe(0);
      expect(state.values.authorizationStatus).toBe("safe-degraded");
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("held indefinitely, source-of-truth-required never produces a stale grant, unlike fail-open", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 5 * 60_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: POLICY_STORE_READ_MODE_KEY, value: "source-of-truth-required" },
      ]);
      expect(state.values.staleGrantRatePercent).toBe(0);
      expect(state.values.cumulativeStalePrivilegeGrantCount).toBe(0);
    });
  });

  describe("Sequencing sensitivity (principal sequencing required)", () => {
    it("safe sequence: engage a propagation lever + verify before trust + wait for convergence reaches OPTIMAL", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("unsafe sequence: propagation lever engaged but never verifying convergence never reaches OPTIMAL", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, [
        { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_INVALIDATION_MODE_KEY, value: "immediate" },
        // convergenceVerification deliberately never set — stays "unverified".
      ]);
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Alternate strong paths: push-based and targeted-purge-based both reach OPTIMAL independently", () => {
    it("alternate strong path 1 (immediate push + verify) reaches converged-safe", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("alternate strong path 2 (targeted purge + verify) reaches converged-safe", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_TARGETED_PURGE_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("both alternate strong paths reach OPTIMAL with identical recovery/dataIntegrity/reliability, differing honestly only on cost (push invalidation has real ongoing infra cost; a one-off targeted purge does not)", () => {
      const pushState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      const purgeState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_TARGETED_PURGE_ACTIONS);
      const pushResult = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, pushState);
      const purgeResult = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, purgeState);
      const pushScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        extractFinishScoringInputs(privilegeEscalationViaStaleAuthorizationCacheSimulation, pushResult),
      );
      const purgeScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        extractFinishScoringInputs(privilegeEscalationViaStaleAuthorizationCacheSimulation, purgeResult),
      );
      // Both are genuinely OPTIMAL and score identically on every
      // security/recovery dimension — the two paths are NOT forced to
      // an artificial total tie, because immediate push invalidation
      // carries a real ongoing infrastructure cost (ControlDefinition
      // perUnitMonthlyUsd) that a one-off targeted purge does not. This
      // is an honest, deliberate cost-efficiency distinction between
      // two otherwise-equally-safe strong paths, consistent with
      // phase-6e-strategy-spec.md section 10's cost-efficiency
      // requirement, not a scoring bug.
      expect(pushResult.completionTier).toBe("optimal");
      expect(purgeResult.completionTier).toBe("optimal");
      expect(pushScore.breakdown.recovery).toBe(purgeScore.breakdown.recovery);
      expect(pushScore.breakdown.dataIntegrity).toBe(purgeScore.breakdown.dataIntegrity);
      expect(pushScore.breakdown.reliability).toBe(purgeScore.breakdown.reliability);
      expect(purgeScore.breakdown.costEfficiency).toBeGreaterThan(pushScore.breakdown.costEfficiency);
      expect(purgeScore.total).toBeGreaterThan(pushScore.total);
    });
  });

  describe("Multi-step path", () => {
    it("step 1 alone (engage immediate invalidation) begins real convergence progress but not yet verified-optimal", () => {
      const state = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, [
        { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CACHE_INVALIDATION_MODE_KEY, value: "immediate" },
      ]);
      // Without verify-before-trust, this still lands in the plain
      // fail-closed baseline family rather than the verified-convergence
      // progression — proving verification (not merely engaging a
      // propagation lever) is the real gate on the OPTIMAL path.
      const eligibility = evaluateCompletionEligibility(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("step 2 on top of step 1 (verify-before-trust) unlocks real, verified convergence progress", () => {
      const state = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_PUSH_ACTIONS);
      expect(state.transitions.incidentState).toBe("converging-window1");
    });

    it("step 3 on top of steps 1-2 (wait for the full convergence window) finally reaches OPTIMAL", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      expect(state.transitions.incidentState).toBe("converged-safe");
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(REVOCATION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable (expected default)", () => {
      const state = runScenario(REVOCATION_ONSET_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained escalation still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 6 * 60_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      const result = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(state.status).toBe("failed");
    });
  });

  describe("Scoring", () => {
    it("optimal path (converged-safe) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, state);
      const inputs = extractFinishScoringInputs(privilegeEscalationViaStaleAuthorizationCacheSimulation, result);
      const score = scoreAuthoredAttempt(PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (source-of-truth-required) scores well but below optimal", () => {
      const optimalState = runScenario(CONVERGENCE_FULLY_DONE_MS + 35_000, SAFE_PUSH_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(privilegeEscalationViaStaleAuthorizationCacheSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        extractFinishScoringInputs(privilegeEscalationViaStaleAuthorizationCacheSimulation, optimalResult),
      );

      const acceptableState = runScenario(REVOCATION_ONSET_MS + 40_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: POLICY_STORE_READ_MODE_KEY, value: "source-of-truth-required" },
      ]);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        privilegeEscalationViaStaleAuthorizationCacheSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        extractFinishScoringInputs(privilegeEscalationViaStaleAuthorizationCacheSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit and only the small residual reliability credit the 'not converged' penalty leaves on the table", () => {
      const state = runScenario(SUSTAINED_UNCONVERGED_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      // Not converged (-130) but not the "unverified" sequencing trap
      // either (fleetCacheConvergenceStatus reads "converging", not
      // "unverified", here) — only the base "not converged" penalty
      // applies, leaving the small residual 150-130=20 on the table.
      expect(score.breakdown.reliability).toBe(20);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (fail-open) scores worse than baseline on dataIntegrity AND total, despite availability looking just as good", () => {
      const baselineState = runScenario(SUSTAINED_UNCONVERGED_MS + 60_000);
      const harmfulState = runScenario(SUSTAINED_UNCONVERGED_MS + 60_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      const baselineScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        buildScoringInputs(baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        buildScoringInputs(harmfulState),
      );
      expect(harmfulState.values.requestSuccessRate as number).toBeGreaterThanOrEqual(
        baselineState.values.requestSuccessRate as number,
      );
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (fail-open) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("the assumed-converged sequencing trap scores worse on reliability than the plain unconverged baseline at an equivalent window", () => {
      const assumedState = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000);
      const verifiedState = runScenario(CONVERGENCE_WINDOW_2_MS + 5_000, [
        { atMs: SUSTAINED_UNCONVERGED_MS + 1_000, controlKey: CONVERGENCE_VERIFICATION_KEY, value: "verify-before-trust" },
      ]);
      const assumedScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        buildScoringInputs(assumedState),
      );
      const verifiedScore = scoreAuthoredAttempt(
        PRIVILEGE_ESCALATION_VIA_STALE_AUTHORIZATION_CACHE_SCORING,
        buildScoringInputs(verifiedState),
      );
      expect(assumedScore.breakdown.reliability).toBeLessThan(verifiedScore.breakdown.reliability);
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_PUSH_ACTIONS);
      const runB = runScenario(CONVERGENCE_WINDOW_1_MS + 5_000, SAFE_PUSH_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak stale-grant rate and cumulative count generically via numericWatchFields", () => {
      const state = runScenario(REVOCATION_ONSET_MS + 10_000, [
        { atMs: REVOCATION_ONSET_MS + 1_000, controlKey: CONVERGENCE_UNCERTAINTY_MODE_KEY, value: "fail-open" },
      ]);
      expect(state.peaks.peakValues.staleGrantRatePercent).toBeGreaterThan(0);
      expect(state.peaks.peakValues.cumulativeStalePrivilegeGrantCount).toBeGreaterThan(0);
    });
  });
});
