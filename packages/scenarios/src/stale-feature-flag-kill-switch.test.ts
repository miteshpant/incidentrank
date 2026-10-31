import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { staleFeatureFlagKillSwitch } from "./stale-feature-flag-kill-switch";
import {
  DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
  INSPECT_FLAG_AUDIT_LOG_KEY,
  INSPECT_LEGACY_ENGINE_LOGS_KEY,
  RESTART_CHECKOUT_SERVICE_KEY,
  REVERT_UNRELATED_FLAG_KEY,
  staleFeatureFlagKillSwitchSimulation,
} from "./stale-feature-flag-kill-switch/definition";
import { STALE_FEATURE_FLAG_KILL_SWITCH_SCORING } from "./stale-feature-flag-kill-switch/scoring";
import { staleFeatureFlagKillSwitchCandidateUI } from "./stale-feature-flag-kill-switch/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = staleFeatureFlagKillSwitchSimulation;
const WAKE_MS = 30_000;

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(SIM);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += SIM.tickMs) {
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

    const result = simulate(SIM, state, action, SIM.tickMs);
    state = result.state;
  }

  return state;
}

describe("Stale Feature-Flag Kill Switch", () => {
  it("carries real library metadata, is linear-structured, intermediate, and paid", () => {
    expect(staleFeatureFlagKillSwitch.structure).toBe("linear");
    expect(staleFeatureFlagKillSwitch.difficulty).toBe("intermediate");
    expect(staleFeatureFlagKillSwitch.isFree).toBe(false);
    expect(staleFeatureFlagKillSwitch.library?.category).toBe("Deployments & Reliability");
    expect(staleFeatureFlagKillSwitch.library?.primarySkill).toBeTruthy();
    expect(staleFeatureFlagKillSwitch.library?.skills.length).toBeGreaterThan(0);
  });

  it("version is 1", () => {
    expect(staleFeatureFlagKillSwitch.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = staleFeatureFlagKillSwitchCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("includes at least one root_cause and one downstream_symptom metric", () => {
    const metrics = staleFeatureFlagKillSwitchCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
  });

  it("starts healthy with no legacy engine traffic and no price mismatches", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.priceMismatchRatePercent).toBe(0);
    expect(state.values.legacyPricingEngineTrafficSharePercent).toBe(0);
    expect(state.componentHealth["legacy-pricing-engine"]).toBe("healthy");
  });

  it("the bug is dormant pre-incident — the stale kill switch control exists but nothing is active yet", () => {
    const state = createInitialState(SIM);
    expect(state.controlValues[DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY]).toBe(false);
    expect(state.values.legacyPricingEngineTrafficSharePercent).toBe(0);
  });

  it("an unrelated flag flip wakes the dormant legacy engine — not a new deploy, a dormant bug resurfacing", () => {
    const state = runScenario(WAKE_MS + 1_000);
    expect(state.componentHealth["legacy-pricing-engine"]).toBe("critical");
    expect(state.componentHealth["checkout-service"]).toBe("critical");
    expect(state.values.legacyPricingEngineTrafficSharePercent).toBe(100);
    expect(state.values.priceMismatchRatePercent).toBeGreaterThan(0);
  });

  it("a noise signal (support ticket backlog) climbs during the incident but is causally unrelated to the fix", () => {
    const healthy = createInitialState(SIM);
    const woken = runScenario(WAKE_MS + 1_000);
    expect(woken.values.supportTicketBacklogCount as number).toBeGreaterThan(
      healthy.values.supportTicketBacklogCount as number,
    );
    // Backlog does not reset to a "fixed" baseline just because the real
    // fix was applied — proving it never factored into successCondition/
    // failureCondition/rules as anything but a red herring.
    const fixed = runScenario(WAKE_MS + 20_000, [
      { atMs: WAKE_MS + 1_000, controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, value: true },
    ]);
    expect(fixed.values.supportTicketBacklogCount).toBe(34);
  });

  describe("inferior remediation paths", () => {
    it("restarting the checkout service alone is plausible but insufficient — legacy engine traffic share stays at 100%", () => {
      const state = runScenario(WAKE_MS + 5_000, [
        { atMs: WAKE_MS + 1_000, controlKey: RESTART_CHECKOUT_SERVICE_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-service-only");
      expect(state.values.legacyPricingEngineTrafficSharePercent).toBe(100);
      expect(state.componentHealth["legacy-pricing-engine"]).toBe("critical");
    });

    it("reverting the unrelated trigger flag alone does not put the legacy engine back to sleep — the central trap", () => {
      const state = runScenario(WAKE_MS + 5_000, [
        { atMs: WAKE_MS + 1_000, controlKey: REVERT_UNRELATED_FLAG_KEY, value: false },
      ]);
      expect(state.values.diagnosisPath).toBe("reverted-unrelated-flag-only");
      expect(state.values.legacyPricingEngineTrafficSharePercent).toBe(100);
      expect(state.values.priceMismatchRatePercent).toBeGreaterThan(5);
    });

    it("the two inferior paths are each individually classified neutral, not harmful", () => {
      const restarted = runScenario(WAKE_MS + 5_000, [
        { atMs: WAKE_MS + 1_000, controlKey: RESTART_CHECKOUT_SERVICE_KEY, value: true },
      ]);
      const reverted = runScenario(WAKE_MS + 5_000, [
        { atMs: WAKE_MS + 1_000, controlKey: REVERT_UNRELATED_FLAG_KEY, value: false },
      ]);
      expect(restarted.numberOfHarmfulChanges).toBe(0);
      expect(reverted.numberOfHarmfulChanges).toBe(0);
    });
  });

  describe("the correct fix — disabling the stale kill switch directly", () => {
    it("investigating the flag audit log, then the legacy engine logs, then fixing — reaches the investigated-then-fixed path", () => {
      const state = runScenario(WAKE_MS + 10_000, [
        { atMs: WAKE_MS + 1_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
        { atMs: WAKE_MS + 2_000, controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, value: true },
        {
          atMs: WAKE_MS + 3_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-then-fixed");
      expect(state.componentHealth["legacy-pricing-engine"]).toBe("healthy");
      expect(state.componentHealth["checkout-service"]).toBe("healthy");
    });

    it("investigating the legacy engine logs first, then the flag audit log, then fixing — a different order reaches the same investigated path", () => {
      const state = runScenario(WAKE_MS + 10_000, [
        { atMs: WAKE_MS + 1_000, controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, value: true },
        { atMs: WAKE_MS + 2_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
        {
          atMs: WAKE_MS + 3_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("investigated-then-fixed");
    });

    it("disabling the kill switch without investigating still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(WAKE_MS + 10_000, [
        {
          atMs: WAKE_MS + 1_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["legacy-pricing-engine"]).toBe("healthy");
    });

    it("the real fix works even when the unrelated trigger flag is left untouched at its post-wake value", () => {
      const state = runScenario(WAKE_MS + 10_000, [
        {
          atMs: WAKE_MS + 1_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      expect(state.controlValues[REVERT_UNRELATED_FLAG_KEY]).toBe(true);
      expect(state.componentHealth["legacy-pricing-engine"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires both price mismatches cleared and legacy engine traffic share at zero", () => {
    const state = runScenario(WAKE_MS + 20_000, [
      { atMs: WAKE_MS + 1_000, controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, value: true },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after the price mismatch rate remains elevated past the old sustained window", () => {
    const state = runScenario(WAKE_MS + 95_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
  });

  it("never auto-resolves on its own — status stays non-resolved even once successCondition would be sustained, absent an explicit Finish", () => {
    const state = runScenario(WAKE_MS + 20_000, [
      { atMs: WAKE_MS + 1_000, controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, value: true },
    ]);
    // simulate() never flips status to "resolved" by itself — only an
    // explicit evaluateCandidateDeclaredFinish call does (Phase 7.1
    // doctrine: the engine itself never auto-resolves "resolved").
    expect(state.status).not.toBe("resolved");
    expect(state.resolvedAtMs).toBeNull();
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: WAKE_MS + 1_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
      { atMs: WAKE_MS + 2_000, controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, value: true },
    ];
    const runA = runScenario(WAKE_MS + 10_000, actions);
    const runB = runScenario(WAKE_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(STALE_FEATURE_FLAG_KILL_SWITCH_SCORING, inputs);
    }

    it("a candidate who investigates before fixing scores strictly higher than one who guesses the same fix", () => {
      const investigated = runScenario(WAKE_MS + 10_000, [
        { atMs: WAKE_MS + 1_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
        { atMs: WAKE_MS + 2_000, controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, value: true },
        {
          atMs: WAKE_MS + 3_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      const guessed = runScenario(WAKE_MS + 10_000, [
        {
          atMs: WAKE_MS + 1_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(investigated).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("a candidate who chases an inferior single-action remediation scores lower than one who takes the investigated strong path", () => {
      const investigated = runScenario(WAKE_MS + 10_000, [
        { atMs: WAKE_MS + 1_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
        { atMs: WAKE_MS + 2_000, controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, value: true },
        {
          atMs: WAKE_MS + 3_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      const chasingInferior = runScenario(5 * 60_000, [
        { atMs: WAKE_MS + 1_000, controlKey: RESTART_CHECKOUT_SERVICE_KEY, value: true },
        { atMs: WAKE_MS + 30_000, controlKey: REVERT_UNRELATED_FLAG_KEY, value: false },
      ]);

      expect(scoreOf(investigated).total).toBeGreaterThan(scoreOf(chasingInferior).total);
    });

    it("the dataIntegrity dimension awards full points only for the investigated-then-fixed diagnosisPath", () => {
      const investigated = runScenario(WAKE_MS + 10_000, [
        { atMs: WAKE_MS + 1_000, controlKey: INSPECT_FLAG_AUDIT_LOG_KEY, value: true },
        { atMs: WAKE_MS + 2_000, controlKey: INSPECT_LEGACY_ENGINE_LOGS_KEY, value: true },
        {
          atMs: WAKE_MS + 3_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);
      const guessed = runScenario(WAKE_MS + 10_000, [
        {
          atMs: WAKE_MS + 1_000,
          controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(investigated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(70);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const investigated = runScenario(WAKE_MS + 10_000, [
        { atMs: WAKE_MS + 3_000, controlKey: DISABLE_LEGACY_PRICING_KILL_SWITCH_KEY, value: true },
      ]);
      const result = scoreOf(investigated);

      expect(result.maxPoints).toEqual({
        recovery: 300,
        customerImpact: 200,
        dataIntegrity: 200,
        reliability: 150,
        costEfficiency: 100,
        operationalEfficiency: 50,
      });
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces legacy pricing engine traffic share as the root cause and checkout symptoms as observed effects", () => {
      const state = runScenario(WAKE_MS + 1_000);
      const narrative = buildIncidentNarrative(staleFeatureFlagKillSwitchCandidateUI, state.values);

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Legacy Pricing Engine Traffic Share");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Checkout Error Rate", "Price Mismatch Rate"]),
      );
    });

    it("never surfaces the noise-tagged support ticket backlog in any narrative group", () => {
      const state = runScenario(WAKE_MS + 1_000);
      const narrative = buildIncidentNarrative(staleFeatureFlagKillSwitchCandidateUI, state.values);
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Support Ticket Backlog")).toBe(false);
    });
  });
});
