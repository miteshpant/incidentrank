import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { corsMisconfigurationBlocksPartners } from "./cors-misconfiguration-blocks-partners";
import {
  corsMisconfigurationBlocksPartnersSimulation,
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
  RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
  ROTATE_PARTNER_API_KEYS_KEY,
} from "./cors-misconfiguration-blocks-partners/definition";
import { CORS_MISCONFIGURATION_BLOCKS_PARTNERS_SCORING } from "./cors-misconfiguration-blocks-partners/scoring";
import { corsMisconfigurationBlocksPartnersCandidateUI } from "./cors-misconfiguration-blocks-partners/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = corsMisconfigurationBlocksPartnersSimulation;
const HARDENING_DEPLOYED_MS = 30_000;

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

function scoreOf(state: ReturnType<typeof runScenario>) {
  const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
  const inputs =
    finishResult.outcome === "resolved"
      ? extractFinishScoringInputs(SIM, finishResult)
      : extractScoringInputs(SIM, state);
  return scoreAuthoredAttempt(CORS_MISCONFIGURATION_BLOCKS_PARTNERS_SCORING, inputs);
}

describe("CORS Misconfiguration Blocks Partner Integrations", () => {
  it("carries real library metadata, is linear-structured, senior-level, and paid", () => {
    expect(corsMisconfigurationBlocksPartners.structure).toBe("linear");
    expect(corsMisconfigurationBlocksPartners.difficulty).toBe("senior");
    expect(corsMisconfigurationBlocksPartners.isFree).toBe(false);
    expect(corsMisconfigurationBlocksPartners.library?.category).toBe("Security & Identity");
    expect(corsMisconfigurationBlocksPartners.library?.primarySkill).toBeTruthy();
    expect(corsMisconfigurationBlocksPartners.library?.skills.length).toBeGreaterThan(0);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = corsMisconfigurationBlocksPartnersCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("tags at least one root_cause and one downstream_symptom metric", () => {
    const metrics = corsMisconfigurationBlocksPartnersCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "noise")).toBe(true);
  });

  it("starts healthy with its own authored initial values", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.internalWebAppErrorRatePercent).toBe(0.2);
    expect(state.values.partnerApiErrorRatePercent).toBe(1);
    expect(state.values.corsPolicyStatus).toBe("normal");
  });

  it("the internal web app stays healthy while partner integrations break — the misleading signal", () => {
    const state = runScenario(HARDENING_DEPLOYED_MS + 1_000);
    expect(state.componentHealth["internal-web-app"]).toBe("healthy");
    expect(state.componentHealth["cors-policy-enforcer"]).toBe("critical");
    expect(state.componentHealth["partner-integration-service"]).toBe("critical");
    expect(state.values.internalWebAppErrorRatePercent).toBeLessThan(1);
  });

  it("partner CORS preflight rejection rate and API error rate spike once the hardening deploys", () => {
    const state = runScenario(HARDENING_DEPLOYED_MS + 1_000);
    expect(state.values.partnerCorsPreflightRejectionRatePercent as number).toBeGreaterThanOrEqual(
      90,
    );
    expect(state.values.partnerApiErrorRatePercent as number).toBeGreaterThanOrEqual(90);
  });

  it("a noise signal (CDN cache hit rate) is unaffected by the incident or its fix", () => {
    const healthy = createInitialState(SIM);
    const blocked = runScenario(HARDENING_DEPLOYED_MS + 1_000);
    const fixed = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
      {
        atMs: HARDENING_DEPLOYED_MS + 1_000,
        controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
        value: "allowlist-partners",
      },
    ]);
    // CDN cache hit rate never moves meaningfully across healthy, blocked,
    // or fixed — proving it never factored into rules/success/failure.
    expect(
      Math.abs(
        (blocked.values.cdnCacheHitRatePercent as number) -
          (healthy.values.cdnCacheHitRatePercent as number),
      ),
    ).toBeLessThan(5);
    expect(fixed.values.cdnCacheHitRatePercent).toBe(90);
  });

  describe("inferior investigation paths", () => {
    it("rotating partner API keys alone is plausible but unrelated — the preflight rejection persists", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 5_000, [
        { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: ROTATE_PARTNER_API_KEYS_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("rotated-keys-only");
      expect(state.values.partnerApiErrorRatePercent as number).toBeGreaterThanOrEqual(90);
      expect(state.componentHealth["partner-integration-service"]).toBe("critical");
    });

    it("restarting the partner integration service alone does nothing — the service was never unhealthy", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 5_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
          value: true,
        },
      ]);
      expect(state.values.diagnosisPath).toBe("restarted-service-only");
      expect(state.values.partnerCorsPreflightRejectionRatePercent as number).toBeGreaterThanOrEqual(
        90,
      );
    });
  });

  describe("the wildcard-open trap", () => {
    it("wildcard-open drives traffic metrics to look fully healthy", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 5_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "wildcard-open",
        },
      ]);
      expect(state.values.partnerApiErrorRatePercent).toBe(1);
      expect(state.values.partnerCorsPreflightRejectionRatePercent).toBe(1);
    });

    it("but corsPolicyStatus reflects a security regression, and Finish refuses to resolve it", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "wildcard-open",
        },
      ]);
      expect(state.values.corsPolicyStatus).toBe("critical");
      expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("declared_unstable");
    });

    it("is classified as a harmful action even though the engine never auto-fails it", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 5_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "wildcard-open",
        },
      ]);
      expect(state.numberOfHarmfulChanges).toBe(1);
      expect(state.status).not.toBe("failed");
    });
  });

  describe("the correct, correlated fix — order independence", () => {
    it("investigating the policy diff, then error logs, then preflight responses, then allowlisting — reaches the correlated path", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: INSPECT_CORS_POLICY_DIFF_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 2_000,
          controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 3_000,
          controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 4_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["cors-policy-enforcer"]).toBe("healthy");
      expect(state.componentHealth["partner-integration-service"]).toBe("healthy");
    });

    it("investigating in a different order (preflight, then logs, then policy diff) reaches the same correlated path", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 2_000,
          controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 3_000,
          controlKey: INSPECT_CORS_POLICY_DIFF_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 4_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("allowlisting without investigating first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["cors-policy-enforcer"]).toBe("healthy");
    });
  });

  it("verification: successCondition requires both error rates recovered AND corsPolicyStatus not critical", () => {
    const state = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
      {
        atMs: HARDENING_DEPLOYED_MS + 1_000,
        controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
        value: "allowlist-partners",
      },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
    expect(evaluateCandidateDeclaredFinish(SIM, state).completionTier).toBe("optimal");
  });

  it("stays active (never auto-resolves, never auto-fails) even once the correct fix has been sustained for a long time — Phase 7.1 doctrine", () => {
    const state = runScenario(HARDENING_DEPLOYED_MS + 50_000, [
      {
        atMs: HARDENING_DEPLOYED_MS + 1_000,
        controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
        value: "allowlist-partners",
      },
    ]);
    expect(state.status).not.toBe("resolved");
    expect(state.resolvedAtMs).toBeNull();
    expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
      SIM.successCondition.sustainedSeconds,
    );
  });

  it("stays active (never auto-fails) even after the error rate remains critical past the old sustained window", () => {
    const state = runScenario(HARDENING_DEPLOYED_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY, value: true },
      {
        atMs: HARDENING_DEPLOYED_MS + 2_000,
        controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
        value: "allowlist-partners",
      },
    ];
    const runA = runScenario(HARDENING_DEPLOYED_MS + 10_000, actions);
    const runB = runScenario(HARDENING_DEPLOYED_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: INSPECT_CORS_POLICY_DIFF_KEY, value: true },
        {
          atMs: HARDENING_DEPLOYED_MS + 2_000,
          controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 3_000,
          controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 4_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      const guessed = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(guessed).total);
    });

    it("a candidate who chases inferior single-service remediations scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: INSPECT_CORS_POLICY_DIFF_KEY, value: true },
        {
          atMs: HARDENING_DEPLOYED_MS + 2_000,
          controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 3_000,
          controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 4_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: ROTATE_PARTNER_API_KEYS_KEY, value: true },
        {
          atMs: HARDENING_DEPLOYED_MS + 30_000,
          controlKey: RESTART_PARTNER_INTEGRATION_SERVICE_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the wildcard-open trap scores lower than the correlated fix despite looking healthy on traffic metrics alone", () => {
      const correlated = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      const wildcard = runScenario(5 * 60_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "wildcard-open",
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(wildcard).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: INSPECT_CORS_POLICY_DIFF_KEY, value: true },
        {
          atMs: HARDENING_DEPLOYED_MS + 2_000,
          controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 3_000,
          controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY,
          value: true,
        },
        {
          atMs: HARDENING_DEPLOYED_MS + 4_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      const guessed = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 1_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(HARDENING_DEPLOYED_MS + 20_000, [
        {
          atMs: HARDENING_DEPLOYED_MS + 4_000,
          controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
          value: "allowlist-partners",
        },
      ]);
      const result = scoreOf(correlated);

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
    it("surfaces the preflight rejection rate as the root cause and partner metrics as observed effects", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 1_000);
      const narrative = buildIncidentNarrative(
        corsMisconfigurationBlocksPartnersCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain(
        "Partner CORS Preflight Rejection Rate",
      );
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Partner API Error Rate", "Partner Integration Request Volume"]),
      );
      expect(narrative.context.map((e) => e.label)).toContain("Internal Web App Error Rate");
    });

    it("never surfaces the noise-tagged CDN cache hit rate in any narrative group", () => {
      const state = runScenario(HARDENING_DEPLOYED_MS + 1_000);
      const narrative = buildIncidentNarrative(
        corsMisconfigurationBlocksPartnersCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "CDN Cache Hit Rate")).toBe(false);
    });
  });
});
