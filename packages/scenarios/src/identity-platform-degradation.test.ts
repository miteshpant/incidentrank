import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { identityPlatformDegradation } from "./identity-platform-degradation";
import {
  LOGIN_CONCURRENCY_LIMIT_KEY,
  MFA_POLICY_BY_RISK_TIER_KEY,
  MFA_RETRY_BACKOFF_KEY,
  PRIVILEGED_ACTION_MODE_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
  SESSION_TTL_SECONDS_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
  identityPlatformDegradationSimulation,
} from "./identity-platform-degradation/definition";
import { identityPlatformDegradationCandidateUI } from "./identity-platform-degradation/candidate-ui";
import { IDENTITY_PLATFORM_DEGRADATION_SCORING } from "./identity-platform-degradation/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  DEGRADATION_ONSET_MS,
  MFA_PROVIDER_RECOVERED_MS,
  MFA_PROVIDER_RECOVERING_MS,
  RELIEF_WINDOW_1_MS,
  RELIEF_WINDOW_2_MS,
  RELIEF_WINDOW_FULLY_RELIEVED_MS,
  SUSTAINED_PRESSURE_MS,
} from "./identity-platform-degradation/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(identityPlatformDegradationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += identityPlatformDegradationSimulation.tickMs
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
      identityPlatformDegradationSimulation,
      state,
      action,
      identityPlatformDegradationSimulation.tickMs,
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
    initialMonthlyInfrastructureCostUsd: identityPlatformDegradationSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Safe sequence: bounded-degrade + usable risk engine + token-only
// continuation + throttled concurrency + backoff, engaged right after
// onset.
const SAFE_BOUNDED_DEGRADE_ACTIONS: TimedAction[] = [
  { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "risk-based-bounded-degrade" },
  { atMs: DEGRADATION_ONSET_MS + 2_000, controlKey: PRIVILEGED_ACTION_MODE_KEY, value: "temporarily-unavailable" },
  { atMs: DEGRADATION_ONSET_MS + 3_000, controlKey: TOKEN_ONLY_CONTINUATION_KEY, value: true },
  { atMs: DEGRADATION_ONSET_MS + 4_000, controlKey: MFA_RETRY_BACKOFF_KEY, value: "backoff" },
];

// Safe full-recovery sequence: relief-eviction + token-only
// continuation, engaged once the MFA Provider has fully recovered.
const SAFE_RELIEF_ACTIONS: TimedAction[] = [
  { atMs: MFA_PROVIDER_RECOVERED_MS + 1_000, controlKey: TOKEN_ONLY_CONTINUATION_KEY, value: true },
  { atMs: MFA_PROVIDER_RECOVERED_MS + 2_000, controlKey: SESSION_CACHE_MODE_KEY, value: "relief-eviction" },
];

describe("Identity Platform Degradation", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(identityPlatformDegradation.isFree).toBe(false);
      expect(identityPlatformDegradation.library?.category).toBe("Security & Identity");
      expect(identityPlatformDegradation.library?.tags.length).toBeGreaterThan(0);
      expect(identityPlatformDegradation.library?.skills.length).toBeGreaterThan(0);
      expect(identityPlatformDegradation.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = IDENTITY_PLATFORM_DEGRADATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = IDENTITY_PLATFORM_DEGRADATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(identityPlatformDegradationCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(identityPlatformDegradationCandidateUI.controls.length).toBe(8);
      expect(identityPlatformDegradationCandidateUI.components.length).toBe(8);
    });

    it("the architecture has exactly 8 flat nodes and 7 edges matching the spec", () => {
      expect(identityPlatformDegradationSimulation.architecture.nodes.length).toBe(8);
      expect(identityPlatformDegradationSimulation.architecture.edges.length).toBe(7);
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(identityPlatformDegradation.description).toMatch(/verified without forcing unnecessary MFA/i);
      expect(identityPlatformDegradation.description).toMatch(/may never bypass mandatory MFA/i);
      expect(identityPlatformDegradation.description).toMatch(/fail-open is never permitted/i);
      expect(identityPlatformDegradation.description).toMatch(/bounded degraded mode/i);
      expect(identityPlatformDegradation.description).toMatch(/not invalidate active sessions unnecessarily/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of identityPlatformDegradationSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control is exercised by at least one action classification rule", () => {
      const controlKeys = identityPlatformDegradationSimulation.controls.map((c) => c.key);
      const classifiedKeys = new Set(
        identityPlatformDegradationSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const key of controlKeys) {
        expect(classifiedKeys.has(key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(identityPlatformDegradationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.highRiskActionsAuthenticatedWithoutMfaCount).toBe(0);
      expect(state.values.sessionStorePressureLevel).toBe(10);
    });

    it("degradation onset triggers the incident while Token Verification stays fully healthy (decoy signal)", () => {
      const state = runScenario(DEGRADATION_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(DEGRADATION_ONSET_MS);
      expect(state.values.tokenVerificationSuccessRate).toBe(99.9);
      expect(state.values.mfaProviderStatus).toBe("critical");
      expect(state.values.sessionStorePressureLevel).toBeGreaterThan(10);
    });

    it("baseline (no action) is fail-closed-safe but needlessly blocks low-risk logins", () => {
      const state = runScenario(DEGRADATION_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("fail-closed-mandatory-all-baseline");
      expect(state.values.authSecurityStatus).toBe("fail-closed");
      expect(state.values.lowRiskLoginSuccessRate).toBeLessThan(60);
      expect(state.values.highRiskActionsAuthenticatedWithoutMfaCount).toBe(0);
    });

    it("leaving the incident unaddressed long enough escalates into a materially worse fail-closed state (sustained pressure)", () => {
      const state = runScenario(SUSTAINED_PRESSURE_MS + 5_000);
      expect(state.transitions.incidentState).toBe("fail-closed-mandatory-all-sustained");
      const early = runScenario(DEGRADATION_ONSET_MS + 5_000);
      expect(state.values.sessionStorePressureLevel as number).toBeGreaterThan(
        early.values.sessionStorePressureLevel as number,
      );
    });

    describe("Required pressure-transfer mechanism: unlimited concurrency + aggressive retries worsen both dependencies", () => {
      it("harmful/tempting path makes Session Store pressure AND MFA failure rate measurably WORSE than baseline", () => {
        const baseline = runScenario(DEGRADATION_ONSET_MS + 10_000);
        const amplified = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: LOGIN_CONCURRENCY_LIMIT_KEY, value: "unlimited" },
        ]);
        expect(amplified.transitions.incidentState).toBe("pressure-amplified-retries-and-concurrency");
        expect(amplified.values.sessionStorePressureLevel as number).toBeGreaterThan(
          baseline.values.sessionStorePressureLevel as number,
        );
        expect(amplified.values.mfaProviderFailureRate as number).toBeGreaterThan(
          baseline.values.mfaProviderFailureRate as number,
        );
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, amplified);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Required security-QA unsafe path: broad MFA bypass", () => {
      it("availability improves while authSecurityStatus is compromised and a historical count accumulates", () => {
        const baseline = runScenario(DEGRADATION_ONSET_MS + 10_000);
        const bypassed = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(bypassed.transitions.incidentState).toBe("mfa-bypass-all-compromised");
        // Availability genuinely improves.
        expect(bypassed.values.lowRiskLoginSuccessRate as number).toBeGreaterThan(
          baseline.values.lowRiskLoginSuccessRate as number,
        );
        expect(bypassed.values.highRiskLoginSuccessRate as number).toBeGreaterThan(
          baseline.values.highRiskLoginSuccessRate as number,
        );
        // Security invariant is violated.
        expect(bypassed.values.authSecurityStatus).toBe("compromised");
        // Historical security consequence accumulates.
        expect(bypassed.values.highRiskActionsAuthenticatedWithoutMfaCount as number).toBeGreaterThan(0);
        // Can never resolve as safe via this path.
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, bypassed);
        expect(eligibility).toEqual({ eligible: false });
        // Finish returns unstable regardless of how healthy other metrics look.
        const finish = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, bypassed);
        expect(finish.outcome).toBe("declared_unstable");
      });

      it("the historical count compounds the longer bypass is left active (sustained window)", () => {
        const earlyBypass = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        const sustainedBypass = runScenario(SUSTAINED_PRESSURE_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(sustainedBypass.values.highRiskActionsAuthenticatedWithoutMfaCount as number).toBeGreaterThan(
          earlyBypass.values.highRiskActionsAuthenticatedWithoutMfaCount as number,
        );
      });

      it("even availability improving further while the MFA Provider itself is recovering does not make bypass safe", () => {
        const bypassedDuringRecovery = runScenario(MFA_PROVIDER_RECOVERING_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(bypassedDuringRecovery.transitions.incidentState).toBe("mfa-bypass-all-compromised-during-recovery");
        expect(bypassedDuringRecovery.values.authSecurityStatus).toBe("compromised");
        const eligibility = evaluateCompletionEligibility(
          identityPlatformDegradationSimulation,
          bypassedDuringRecovery,
        );
        expect(eligibility).toEqual({ eligible: false });
      });

      it("holding broad bypass through the sustained-pressure window reaches automatic failure", () => {
        const state = runScenario(SUSTAINED_PRESSURE_MS + 50_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
        ]);
        expect(state.status).toBe("failed");
        expect(state.failedAtMs).not.toBeNull();
      });

      it("privileged-action-specific bypass (allow-with-cached-risk) is an equally unsafe, separately-tracked violation", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: PRIVILEGED_ACTION_MODE_KEY, value: "allow-with-cached-risk" },
        ]);
        expect(state.transitions.incidentState).toBe("privileged-allow-with-cached-risk-compromised");
        expect(state.values.authSecurityStatus).toBe("compromised");
        expect(state.values.highRiskActionsAuthenticatedWithoutMfaCount as number).toBeGreaterThan(0);
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Invariant #5: session-store relief must not invalidate active sessions unnecessarily", () => {
      it("relief-eviction without token-only continuation evicts active sessions it did not need to", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: SESSION_CACHE_MODE_KEY, value: "relief-eviction" },
        ]);
        expect(state.transitions.incidentState).toBe("relief-eviction-without-token-protection");
        expect(state.values.activeSessionsUnnecessarilyInvalidatedCount as number).toBeGreaterThan(0);
      });

      it("relief-eviction WITH token-only continuation protects active sessions (zero unnecessary invalidation)", () => {
        const state = runScenario(MFA_PROVIDER_RECOVERED_MS + 10_000, SAFE_RELIEF_ACTIONS);
        expect(state.values.activeSessionsUnnecessarilyInvalidatedCount).toBe(0);
      });
    });

    describe("Legitimate degraded-but-safe state: risk-based bounded degrade", () => {
      it("requires a usable Risk Engine — disabling it falls back to fail-closed outcomes at a real authored cost", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "risk-based-bounded-degrade" },
          { atMs: DEGRADATION_ONSET_MS + 2_000, controlKey: RISK_ENGINE_MODE_KEY, value: "disabled" },
        ]);
        expect(state.transitions.incidentState).toBe("bounded-degrade-requested-risk-engine-disabled");
        expect(state.values.authSecurityStatus).toBe("fail-closed");
        expect(state.values.lowRiskLoginSuccessRate).toBe(42);
      });

      it("real bounded-degrade with privileged actions protected: low-risk succeeds, high-risk/privileged stay protected, zero violations", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 30_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "risk-based-bounded-degrade" },
        ]);
        expect(state.transitions.incidentState).toBe("bounded-degrade-protected-privileged");
        expect(state.values.authSecurityStatus).toBe("bounded-degraded");
        expect(state.values.lowRiskLoginSuccessRate).toBeGreaterThan(90);
        expect(state.values.highRiskActionsAuthenticatedWithoutMfaCount).toBe(0);
        expect(state.values.activeSessionsUnnecessarilyInvalidatedCount).toBe(0);
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });

      it("real bounded-degrade with privileged actions explicitly offline is equally acceptable", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 30_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "risk-based-bounded-degrade" },
          { atMs: DEGRADATION_ONSET_MS + 2_000, controlKey: PRIVILEGED_ACTION_MODE_KEY, value: "temporarily-unavailable" },
        ]);
        expect(state.transitions.incidentState).toBe("bounded-degrade-privileged-unavailable");
        expect(state.values.privilegedActionAvailability).toBe(0);
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      });
    });

    describe("Recovery lag: session-store pressure drains only over real elapsed relief time", () => {
      it("MFA Provider full recovery alone does not address session-store pressure (separate axis)", () => {
        const state = runScenario(MFA_PROVIDER_RECOVERED_MS + 5_000);
        expect(state.transitions.incidentState).toBe("mfa-provider-recovered-pressure-unaddressed");
        expect(state.values.mfaProviderStatus).toBe("normal");
        expect(state.values.sessionStorePressureLevel).toBeGreaterThan(50);
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("relief engaged but no elapsed window yet does not instantly clear pressure (tick-zero proof)", () => {
        const state = runScenario(MFA_PROVIDER_RECOVERED_MS + 10_000, [
          { atMs: MFA_PROVIDER_RECOVERED_MS + 1_000, controlKey: TOKEN_ONLY_CONTINUATION_KEY, value: true },
          { atMs: MFA_PROVIDER_RECOVERED_MS + 2_000, controlKey: SESSION_CACHE_MODE_KEY, value: "relief-eviction" },
        ]);
        expect(state.transitions.incidentState).toBe("relief-just-engaged");
        expect(state.values.sessionStorePressureLevel).toBe(60);
      });

      it("after the first relief window, pressure has genuinely dropped but is not yet at baseline", () => {
        const window1 = runScenario(RELIEF_WINDOW_1_MS + 5_000, SAFE_RELIEF_ACTIONS);
        expect(window1.transitions.incidentState).toBe("relief-draining-window1-safe");
        expect(window1.values.sessionStorePressureLevel).toBeLessThan(60);
        expect(window1.values.sessionStorePressureLevel as number).toBeGreaterThan(15);
      });

      it("after the second relief window, pressure has dropped further still", () => {
        const window1 = runScenario(RELIEF_WINDOW_1_MS + 5_000, SAFE_RELIEF_ACTIONS);
        const window2 = runScenario(RELIEF_WINDOW_2_MS + 5_000, SAFE_RELIEF_ACTIONS);
        expect(window2.transitions.incidentState).toBe("relief-draining-window2-safe");
        expect(window2.values.sessionStorePressureLevel as number).toBeLessThan(
          window1.values.sessionStorePressureLevel as number,
        );
      });

      it("only after the fully-relieved window does pressure reach genuine baseline", () => {
        const drained = runScenario(RELIEF_WINDOW_FULLY_RELIEVED_MS + 35_000, SAFE_RELIEF_ACTIONS);
        expect(drained.transitions.incidentState).toBe("fully-relieved-safe");
        expect(drained.values.sessionStorePressureLevel).toBeLessThanOrEqual(15);
      });

      it("alternate strong path: throttled concurrency also reaches full relief without any eviction risk", () => {
        const drained = runScenario(RELIEF_WINDOW_FULLY_RELIEVED_MS + 35_000, [
          { atMs: MFA_PROVIDER_RECOVERED_MS + 1_000, controlKey: LOGIN_CONCURRENCY_LIMIT_KEY, value: "throttled" },
        ]);
        expect(drained.transitions.incidentState).toBe("fully-relieved-via-throttling");
        expect(drained.values.activeSessionsUnnecessarilyInvalidatedCount).toBe(0);
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, drained);
        expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      });
    });

    describe("Sequencing sensitivity", () => {
      it("safe sequence: bounded-degrade + protected risk engine + token-only continuation reaches a real acceptable, violation-free state", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 30_000, SAFE_BOUNDED_DEGRADE_ACTIONS);
        expect(state.values.authSecurityStatus).toBe("bounded-degraded");
        expect(state.values.highRiskActionsAuthenticatedWithoutMfaCount).toBe(0);
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
        expect(eligibility.eligible).toBe(true);
      });

      it("unsafe sequence: setting bounded-degrade AFTER already disabling the risk engine still falls back to fail-closed, never a false-acceptable", () => {
        const state = runScenario(DEGRADATION_ONSET_MS + 10_000, [
          { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: RISK_ENGINE_MODE_KEY, value: "disabled" },
          { atMs: DEGRADATION_ONSET_MS + 2_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "risk-based-bounded-degrade" },
        ]);
        expect(state.transitions.incidentState).toBe("bounded-degrade-requested-risk-engine-disabled");
        expect(state.values.authSecurityStatus).toBe("fail-closed");
        const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    it("tracks peak historical exposure generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_PRESSURE_MS + 5_000, [
        { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
      ]);
      expect(state.peaks.peakValues.highRiskActionsAuthenticatedWithoutMfaCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.sessionStorePressureLevel).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(DEGRADATION_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_PRESSURE_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("bounded-degrade-protected-privileged is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(DEGRADATION_ONSET_MS + 30_000, SAFE_BOUNDED_DEGRADE_ACTIONS);
      const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      const finish = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("acceptable");
    });

    it("fully-relieved-safe is Finish-eligible as optimal", () => {
      const state = runScenario(RELIEF_WINDOW_FULLY_RELIEVED_MS + 35_000, SAFE_RELIEF_ACTIONS);
      const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("fail-closed baseline (safe but blunt) is never Finish-eligible at any tier", () => {
      const state = runScenario(DEGRADATION_ONSET_MS + 20_000);
      const eligibility = evaluateCompletionEligibility(identityPlatformDegradationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_PRESSURE_MS + 50_000, [
        { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
      ]);
      const result = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-relieved) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(RELIEF_WINDOW_FULLY_RELIEVED_MS + 35_000, SAFE_RELIEF_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, state);
      const inputs = extractFinishScoringInputs(identityPlatformDegradationSimulation, result);
      const score = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.breakdown.reliability).toBe(150);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("acceptable path (bounded-degrade) scores well but below optimal", () => {
      const optimalState = runScenario(RELIEF_WINDOW_FULLY_RELIEVED_MS + 35_000, SAFE_RELIEF_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(identityPlatformDegradationSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, optimalInputs);

      const acceptableState = runScenario(DEGRADATION_ONSET_MS + 30_000, SAFE_BOUNDED_DEGRADE_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(identityPlatformDegradationSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(identityPlatformDegradationSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      // Acceptable scores higher than optimal on recovery/customerImpact
      // (it genuinely resolves far faster and with far less revenue
      // loss, which is real and correctly rewarded) but dataIntegrity +
      // reliability's combined gap is deliberately sized large enough
      // to still keep optimal's TOTAL ahead — see the score-sanity
      // audit in definition.ts.
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThan(0);
      expect(acceptableScore.breakdown.reliability).toBeLessThan(optimalScore.breakdown.reliability);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
    });

    it("baseline (no action, fail-closed) scores poorly with zero recovery credit and low reliability credit", () => {
      const state = runScenario(SUSTAINED_PRESSURE_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      // Never resolved -> criticalTimeRatio reads as infinite -> the
      // tightest criticalTimeRatio penalty always applies, but the
      // pressure-transfer-specific penalty does NOT (no amplification
      // lever was used), so this is low but not the absolute floor.
      expect(score.breakdown.reliability).toBeLessThanOrEqual(30);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (broad MFA bypass) scores WORSE on dataIntegrity+reliability than the baseline despite better availability", () => {
      const baselineState = runScenario(SUSTAINED_PRESSURE_MS + 60_000);
      const baselineInputs = buildScoringInputs(baselineState);
      const baselineScore = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, baselineInputs);

      const bypassState = runScenario(SUSTAINED_PRESSURE_MS + 60_000, [
        { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: MFA_POLICY_BY_RISK_TIER_KEY, value: "bypass-all" },
      ]);
      const bypassInputs = buildScoringInputs(bypassState);
      const bypassScore = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, bypassInputs);

      // Availability-good / correctness-bad: bypass has materially
      // better raw login success rates...
      expect(bypassState.values.lowRiskLoginSuccessRate as number).toBeGreaterThan(
        baselineState.values.lowRiskLoginSuccessRate as number,
      );
      // ...but scores strictly worse on the dimensions that matter.
      expect(bypassScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(bypassScore.breakdown.reliability).toBeLessThanOrEqual(baselineScore.breakdown.reliability);
      expect(bypassScore.total).toBeLessThan(baselineScore.total);
      console.log("HARMFUL (bypass-all) SCORE", JSON.stringify(bypassScore));
      console.log("BASELINE SCORE (for comparison)", JSON.stringify(baselineScore));
    });

    it("the pressure-amplified trap scores worse on reliability than the plain baseline", () => {
      const baselineState = runScenario(DEGRADATION_ONSET_MS + 60_000);
      const baselineInputs = buildScoringInputs(baselineState);
      const baselineScore = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, baselineInputs);

      const amplifiedState = runScenario(DEGRADATION_ONSET_MS + 60_000, [
        { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: LOGIN_CONCURRENCY_LIMIT_KEY, value: "unlimited" },
      ]);
      const amplifiedInputs = buildScoringInputs(amplifiedState);
      const amplifiedScore = scoreAuthoredAttempt(IDENTITY_PLATFORM_DEGRADATION_SCORING, amplifiedInputs);

      expect(amplifiedScore.breakdown.reliability).toBeLessThan(baselineScore.breakdown.reliability);
      console.log("PRESSURE-AMPLIFIED SCORE", JSON.stringify(amplifiedScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(RELIEF_WINDOW_1_MS + 5_000, SAFE_RELIEF_ACTIONS);
      const runB = runScenario(RELIEF_WINDOW_1_MS + 5_000, SAFE_RELIEF_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("sessionTtlSeconds control: real, wired mechanics on both the pressure-transfer trap and the relief side", () => {
    it("a short TTL (300s) stacked on the amplification trap makes it measurably WORSE than the trap alone", () => {
      const plainAmplified = runScenario(DEGRADATION_ONSET_MS + 10_000, [
        { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: LOGIN_CONCURRENCY_LIMIT_KEY, value: "unlimited" },
      ]);
      const withShortTtl = runScenario(DEGRADATION_ONSET_MS + 10_000, [
        { atMs: DEGRADATION_ONSET_MS + 1_000, controlKey: LOGIN_CONCURRENCY_LIMIT_KEY, value: "unlimited" },
        { atMs: DEGRADATION_ONSET_MS + 2_000, controlKey: SESSION_TTL_SECONDS_KEY, value: 300 },
      ]);
      expect(withShortTtl.transitions.incidentState).toBe("pressure-amplified-retries-concurrency-and-short-ttl");
      expect(withShortTtl.values.sessionStorePressureLevel as number).toBeGreaterThan(
        plainAmplified.values.sessionStorePressureLevel as number,
      );
      expect(withShortTtl.values.mfaProviderFailureRate as number).toBeGreaterThan(
        plainAmplified.values.mfaProviderFailureRate as number,
      );
    });

    it("an extended TTL (7200s) accelerates relief at the identical elapsed window versus the default TTL", () => {
      const defaultTtlRelief = runScenario(RELIEF_WINDOW_1_MS + 5_000, SAFE_RELIEF_ACTIONS);
      const extendedTtlRelief = runScenario(RELIEF_WINDOW_1_MS + 5_000, [
        ...SAFE_RELIEF_ACTIONS,
        { atMs: MFA_PROVIDER_RECOVERED_MS + 3_000, controlKey: SESSION_TTL_SECONDS_KEY, value: 7_200 },
      ]);
      expect(defaultTtlRelief.transitions.incidentState).toBe("relief-draining-window1-safe");
      expect(extendedTtlRelief.transitions.incidentState).toBe("relief-draining-window1-extended-ttl");
      expect(extendedTtlRelief.values.sessionStorePressureLevel as number).toBeLessThan(
        defaultTtlRelief.values.sessionStorePressureLevel as number,
      );
    });
  });
});
