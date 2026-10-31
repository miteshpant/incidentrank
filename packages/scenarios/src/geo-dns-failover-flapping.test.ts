import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { geoDnsFailoverFlapping } from "./geo-dns-failover-flapping";
import {
  geoDnsFailoverFlappingSimulation,
  FORCE_PIN_REGION_KEY,
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "./geo-dns-failover-flapping/definition";
import { GEO_DNS_FAILOVER_FLAPPING_SCORING } from "./geo-dns-failover-flapping/scoring";
import { geoDnsFailoverFlappingCandidateUI } from "./geo-dns-failover-flapping/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = geoDnsFailoverFlappingSimulation;
const LATENCY_BLIPS_BEGIN_MS = 30_000;

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

describe("Geo-DNS Failover Flapping", () => {
  it("carries real library metadata, is linear-structured, senior-level, and paid", () => {
    expect(geoDnsFailoverFlapping.structure).toBe("linear");
    expect(geoDnsFailoverFlapping.difficulty).toBe("senior");
    expect(geoDnsFailoverFlapping.isFree).toBe(false);
    expect(geoDnsFailoverFlapping.library?.category).toBe("API & Traffic");
    expect(geoDnsFailoverFlapping.library?.primarySkill).toBeTruthy();
    expect(geoDnsFailoverFlapping.library?.skills.length).toBeGreaterThan(0);
    expect(geoDnsFailoverFlapping.version).toBe(1);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = geoDnsFailoverFlappingCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("has at least one root_cause and one downstream_symptom metric", () => {
    const metrics = geoDnsFailoverFlappingCandidateUI.metrics;
    expect(metrics.some((m) => m.roleInIncident === "root_cause")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "downstream_symptom")).toBe(true);
    expect(metrics.some((m) => m.roleInIncident === "noise")).toBe(true);
  });

  it("starts healthy with both regions normal and no flapping", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.dnsFailoverFlapCount).toBe(0);
    expect(state.values.clientConnectionResetRatePercent).toBe(0.2);
  });

  it("both regions stay individually healthy while DNS flaps — the misleading signal", () => {
    const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 1_000);
    expect(state.componentHealth["region-east"]).toBe("healthy");
    expect(state.componentHealth["region-west"]).toBe("healthy");
    expect(state.componentHealth["geo-dns"]).toBe("critical");
  });

  it("region p99 latency stays only mildly elevated even while flap count and client resets spike", () => {
    const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 1_000);
    expect(state.values.regionEastP99LatencyMs).toBeLessThan(300);
    expect(state.values.regionWestP99LatencyMs).toBeLessThan(300);
    expect(state.values.dnsFailoverFlapCount as number).toBeGreaterThan(10);
    expect(state.values.clientConnectionResetRatePercent as number).toBeGreaterThan(5);
  });

  it("a noise signal (edge CDN cache hit rate) moves during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const flapping = runScenario(LATENCY_BLIPS_BEGIN_MS + 1_000);
    expect(flapping.values.edgeCdnCacheHitRatePercent as number).toBeLessThan(
      healthy.values.edgeCdnCacheHitRatePercent as number,
    );
    // Cache hit rate stays roughly unchanged by the correct fix, relative
    // to the untouched baseline — proving it never factored into
    // successCondition/failureCondition/rules as a causal signal.
    const fixed = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
      { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
      { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
    ]);
    expect(fixed.values.edgeCdnCacheHitRatePercent).toBe(92);
  });

  describe("inferior investigation path", () => {
    it("force-pinning to one region stops the flap symptom but is not the real fix", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 5_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: FORCE_PIN_REGION_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).toBe("forced-pin");
      expect(state.values.dnsFailoverFlapCount).toBeLessThan(5);
      expect(state.transitions.incidentState).toBe("flapping-pinned");
    });

    it("force-pinning never reaches the correlated-then-fixed diagnosis", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 5_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: FORCE_PIN_REGION_KEY, value: true },
      ]);
      expect(state.values.diagnosisPath).not.toBe("correlated-then-fixed");
    });
  });

  describe("partial fixes", () => {
    it("raising only the failure streak requirement slows but does not stop flapping", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 5_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
      ]);
      expect(state.values.diagnosisPath).toBe("partially-damped");
      expect(state.values.dnsFailoverFlapCount as number).toBeGreaterThan(2);
    });

    it("loosening only the latency tolerance slows but does not stop flapping", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 5_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);
      expect(state.values.diagnosisPath).toBe("partially-damped");
      expect(state.values.dnsFailoverFlapCount as number).toBeGreaterThan(2);
    });
  });

  describe("the correct, correlated fix — order independence", () => {
    it("investigating health-check logs, then region latency, then DNS history, then fixing both thresholds — reaches the correlated path", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["geo-dns"]).toBe("healthy");
      expect(state.values.dnsFailoverFlapCount as number).toBeLessThanOrEqual(2);
    });

    it("investigating DNS history first, then region latency, then health-check logs, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("fixing both thresholds without investigating anything first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["geo-dns"]).toBe("healthy");
    });

    it("the highest available thresholds (5, 1200ms) also reach the correlated path", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 5 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 1_200 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });
  });

  it("verification: successCondition requires low flap count and both client-facing error signals recovered together", () => {
    const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
      { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
      { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after client connection resets remain critical past the old sustained window", () => {
    const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
      { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
      { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
    ];
    const runA = runScenario(LATENCY_BLIPS_BEGIN_MS + 10_000, actions);
    const runB = runScenario(LATENCY_BLIPS_BEGIN_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(GEO_DNS_FAILOVER_FLAPPING_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);
      const guessed = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);

      const correlatedScore = scoreOf(correlated).total;
      const guessedScore = scoreOf(guessed).total;

      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who takes the inferior force-pin shortcut scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);
      const forcedPin = runScenario(5 * 60_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: FORCE_PIN_REGION_KEY, value: true },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(forcedPin).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);
      const guessed = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(200);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(80);
    });

    it("uses the same catalog-wide fixed maxPoints split as every other scenario", () => {
      const correlated = runScenario(LATENCY_BLIPS_BEGIN_MS + 20_000, [
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
        { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
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
    it("surfaces DNS failover flap count as the root cause and client-facing rates as observed effects", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 1_000);
      const narrative = buildIncidentNarrative(geoDnsFailoverFlappingCandidateUI, state.values);

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("DNS Failover Flap Count");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Client Connection Reset Rate", "Client Error Rate"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["US-East p99 Latency", "US-West p99 Latency"]),
      );
    });

    it("never surfaces the noise-tagged edge CDN cache hit rate in any narrative group", () => {
      const state = runScenario(LATENCY_BLIPS_BEGIN_MS + 1_000);
      const narrative = buildIncidentNarrative(geoDnsFailoverFlappingCandidateUI, state.values);
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Edge CDN Cache Hit Rate")).toBe(false);
    });
  });
});
