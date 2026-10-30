import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { checkoutPaymentInventoryRedisContention } from "./checkout-payment-inventory-redis-contention";
import {
  checkoutPaymentInventoryRedisContentionSimulation,
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
  REDIS_CONNECTION_POOL_KEY,
} from "./checkout-payment-inventory-redis-contention/definition";
import { CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING } from "./checkout-payment-inventory-redis-contention/scoring";
import { checkoutPaymentInventoryRedisContentionCandidateUI } from "./checkout-payment-inventory-redis-contention/candidate-ui";
import { scoreAuthoredAttempt } from "./authoring/score";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

const SIM = checkoutPaymentInventoryRedisContentionSimulation;
const CONTENTION_BEGINS_MS = 30_000;

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

describe("Checkout/Payment/Inventory Redis Contention — reference incident", () => {
  it("carries real library metadata, is parallel-structured, staff-level, and paid", () => {
    expect(checkoutPaymentInventoryRedisContention.structure).toBe("parallel");
    expect(checkoutPaymentInventoryRedisContention.difficulty).toBe("staff");
    expect(checkoutPaymentInventoryRedisContention.isFree).toBe(false);
    expect(checkoutPaymentInventoryRedisContention.library?.category).toBe("Distributed Systems");
    expect(checkoutPaymentInventoryRedisContention.library?.primarySkill).toBeTruthy();
    expect(checkoutPaymentInventoryRedisContention.library?.skills.length).toBeGreaterThan(0);
  });

  it("has at least 4 components", () => {
    expect(SIM.architecture.nodes.length).toBeGreaterThanOrEqual(4);
  });

  it("has at least 6 meaningful signals (metrics), tagged with a roleInIncident", () => {
    const metrics = checkoutPaymentInventoryRedisContentionCandidateUI.metrics;
    expect(metrics.length).toBeGreaterThanOrEqual(6);
    for (const metric of metrics) {
      expect(metric.roleInIncident).toBeDefined();
    }
  });

  it("starts healthy with Checkout, Payment, and Inventory all normal", () => {
    const state = createInitialState(SIM);
    expect(state.status).toBe("healthy");
    expect(state.values.checkoutLatencyMs).toBe(80);
    expect(state.values.paymentRetryRatePercent).toBe(2);
    expect(state.values.inventoryP95LatencyMs).toBe(120);
  });

  it("Checkout stays healthy while Payment and Inventory degrade — the misleading signal", () => {
    const state = runScenario(CONTENTION_BEGINS_MS + 1_000);
    expect(state.componentHealth["checkout-api"]).toBe("healthy");
    expect(state.componentHealth["payment-api"]).toBe("critical");
    expect(state.componentHealth["inventory-api"]).toBe("critical");
  });

  it("Redis CPU/memory look normal even while connection utilization is critical — the hidden shared-dependency problem", () => {
    const state = runScenario(CONTENTION_BEGINS_MS + 1_000);
    expect(state.values.redisCpuPercent).toBeLessThan(25);
    expect(state.values.redisMemoryPercent).toBeLessThan(40);
    expect(state.values.redisConnectionUtilizationPercent).toBeGreaterThanOrEqual(90);
  });

  it("a noise signal (monitoring agent flap count) climbs during the incident but is unrelated to root cause", () => {
    const healthy = createInitialState(SIM);
    const contending = runScenario(CONTENTION_BEGINS_MS + 1_000);
    expect(contending.values.monitoringAgentFlapCount as number).toBeGreaterThan(
      healthy.values.monitoringAgentFlapCount as number,
    );
    // Flap count stays roughly unchanged by the correct fix — proving it
    // never factored into successCondition/failureCondition/rules.
    const fixed = runScenario(CONTENTION_BEGINS_MS + 20_000, [
      { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
    ]);
    expect(fixed.values.monitoringAgentFlapCount).toBe(6);
  });

  describe("inferior investigation paths", () => {
    it("restarting Payment pods alone is plausible but insufficient — Inventory stays degraded", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 5_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: RESTART_PAYMENT_PODS_KEY, value: true },
      ]);
      expect(state.componentHealth["inventory-api"]).toBe("degraded");
      expect(state.values.redisConnectionUtilizationPercent).toBeGreaterThanOrEqual(90);
    });

    it("rolling back the Inventory deploy alone does nothing — the deploy was never the cause", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 5_000, [
        {
          atMs: CONTENTION_BEGINS_MS + 1_000,
          controlKey: ROLLBACK_INVENTORY_DEPLOY_KEY,
          value: true,
        },
      ]);
      expect(state.values.inventoryP95LatencyMs).toBeGreaterThan(1_000);
      expect(state.values.redisConnectionUtilizationPercent).toBeGreaterThanOrEqual(90);
    });
  });

  describe("the correct, correlated fix — order independence", () => {
    it("investigating Payment, then Inventory, then Redis, then fixing — reaches the correlated path", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: INSPECT_PAYMENT_METRICS_KEY, value: true },
        {
          atMs: CONTENTION_BEGINS_MS + 2_000,
          controlKey: INSPECT_INVENTORY_DEPLOYS_KEY,
          value: true,
        },
        {
          atMs: CONTENTION_BEGINS_MS + 3_000,
          controlKey: INSPECT_REDIS_CONNECTIONS_KEY,
          value: true,
        },
        { atMs: CONTENTION_BEGINS_MS + 4_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
      expect(state.componentHealth["payment-api"]).toBe("healthy");
      expect(state.componentHealth["inventory-api"]).toBe("healthy");
    });

    it("investigating Redis first, then Inventory, then Payment, then fixing — a different order reaches the same correlated path", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        {
          atMs: CONTENTION_BEGINS_MS + 1_000,
          controlKey: INSPECT_REDIS_CONNECTIONS_KEY,
          value: true,
        },
        {
          atMs: CONTENTION_BEGINS_MS + 2_000,
          controlKey: INSPECT_INVENTORY_DEPLOYS_KEY,
          value: true,
        },
        { atMs: CONTENTION_BEGINS_MS + 3_000, controlKey: INSPECT_PAYMENT_METRICS_KEY, value: true },
        { atMs: CONTENTION_BEGINS_MS + 4_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);
      expect(state.values.diagnosisPath).toBe("correlated-then-fixed");
    });

    it("fixing Redis without investigating anything first still resolves the outage, but as a guessed fix", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);
      expect(state.values.diagnosisPath).toBe("guessed-fix");
      expect(state.componentHealth["payment-api"]).toBe("healthy");
      expect(state.componentHealth["inventory-api"]).toBe("healthy");
    });

    it("a partial pool increase (256) relieves some pressure but is not enough", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 5_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 256 },
      ]);
      expect(state.values.diagnosisPath).toBe("partial-pool-increase");
      expect(state.values.redisConnectionUtilizationPercent).toBeLessThan(97);
      expect(state.values.redisConnectionUtilizationPercent).toBeGreaterThan(50);
    });
  });

  it("verification: successCondition requires Payment, Inventory, and Redis utilization all recovered together", () => {
    const state = runScenario(CONTENTION_BEGINS_MS + 20_000, [
      { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
    ]);
    expect(evaluateCandidateDeclaredFinish(SIM, state).outcome).toBe("resolved");
  });

  it("stays active (never auto-fails) even after Redis connection utilization remains critical past the old sustained window", () => {
    const state = runScenario(CONTENTION_BEGINS_MS + 61_000);
    expect(state.status).not.toBe("failed");
    expect(state.failedAtMs).toBeNull();
    expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
      SIM.failureCondition!.sustainedSeconds,
    );
  });

  it("produces identical state for the same action sequence (determinism)", () => {
    const actions: TimedAction[] = [
      { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: INSPECT_REDIS_CONNECTIONS_KEY, value: true },
      { atMs: CONTENTION_BEGINS_MS + 2_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
    ];
    const runA = runScenario(CONTENTION_BEGINS_MS + 10_000, actions);
    const runB = runScenario(CONTENTION_BEGINS_MS + 10_000, actions);
    expect(runA).toEqual(runB);
  });

  describe("explicitly authored investigation-quality scoring", () => {
    function scoreOf(state: ReturnType<typeof runScenario>) {
      const finishResult = evaluateCandidateDeclaredFinish(SIM, state);
      const inputs =
        finishResult.outcome === "resolved"
          ? extractFinishScoringInputs(SIM, finishResult)
          : extractScoringInputs(SIM, state);
      return scoreAuthoredAttempt(CHECKOUT_PAYMENT_INVENTORY_REDIS_CONTENTION_SCORING, inputs);
    }

    it("a candidate who correlates before fixing scores strictly higher than one who guesses the same fix", () => {
      const correlated = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: INSPECT_PAYMENT_METRICS_KEY, value: true },
        {
          atMs: CONTENTION_BEGINS_MS + 2_000,
          controlKey: INSPECT_INVENTORY_DEPLOYS_KEY,
          value: true,
        },
        {
          atMs: CONTENTION_BEGINS_MS + 3_000,
          controlKey: INSPECT_REDIS_CONNECTIONS_KEY,
          value: true,
        },
        { atMs: CONTENTION_BEGINS_MS + 4_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);
      const guessed = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);

      const correlatedScore = scoreOf(correlated).total;
      const guessedScore = scoreOf(guessed).total;

      expect(correlatedScore).toBeGreaterThan(guessedScore);
    });

    it("a candidate who randomly chases an inferior single-service remediation scores lower than one who takes the correlated strong path", () => {
      const correlated = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: INSPECT_PAYMENT_METRICS_KEY, value: true },
        {
          atMs: CONTENTION_BEGINS_MS + 2_000,
          controlKey: INSPECT_INVENTORY_DEPLOYS_KEY,
          value: true,
        },
        {
          atMs: CONTENTION_BEGINS_MS + 3_000,
          controlKey: INSPECT_REDIS_CONNECTIONS_KEY,
          value: true,
        },
        { atMs: CONTENTION_BEGINS_MS + 4_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);
      const randomExploration = runScenario(5 * 60_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: RESTART_PAYMENT_PODS_KEY, value: true },
        {
          atMs: CONTENTION_BEGINS_MS + 30_000,
          controlKey: ROLLBACK_INVENTORY_DEPLOY_KEY,
          value: true,
        },
      ]);

      expect(scoreOf(correlated).total).toBeGreaterThan(scoreOf(randomExploration).total);
    });

    it("the dataIntegrity dimension awards full points only for the correlated-then-fixed diagnosisPath", () => {
      const correlated = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: INSPECT_PAYMENT_METRICS_KEY, value: true },
        {
          atMs: CONTENTION_BEGINS_MS + 2_000,
          controlKey: INSPECT_INVENTORY_DEPLOYS_KEY,
          value: true,
        },
        {
          atMs: CONTENTION_BEGINS_MS + 3_000,
          controlKey: INSPECT_REDIS_CONNECTIONS_KEY,
          value: true,
        },
        { atMs: CONTENTION_BEGINS_MS + 4_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);
      const guessed = runScenario(CONTENTION_BEGINS_MS + 20_000, [
        { atMs: CONTENTION_BEGINS_MS + 1_000, controlKey: REDIS_CONNECTION_POOL_KEY, value: 512 },
      ]);

      expect(scoreOf(correlated).breakdown.dataIntegrity).toBe(150);
      expect(scoreOf(guessed).breakdown.dataIntegrity).toBe(60);
    });
  });

  describe("post-incident narrative using roleInIncident", () => {
    it("surfaces Redis connection utilization as the root cause and Payment/Inventory as observed effects", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        checkoutPaymentInventoryRedisContentionCandidateUI,
        state.values,
      );

      expect(hasIncidentNarrative(narrative)).toBe(true);
      expect(narrative.rootCause.map((e) => e.label)).toContain("Redis Connection Utilization");
      expect(narrative.observedEffects.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Payment Retry Rate", "Inventory p95 Latency"]),
      );
      expect(narrative.context.map((e) => e.label)).toEqual(
        expect.arrayContaining(["Checkout Latency", "Redis CPU", "Redis Memory"]),
      );
    });

    it("never surfaces the noise-tagged monitoring agent flap count in any narrative group", () => {
      const state = runScenario(CONTENTION_BEGINS_MS + 1_000);
      const narrative = buildIncidentNarrative(
        checkoutPaymentInventoryRedisContentionCandidateUI,
        state.values,
      );
      const all = [
        ...narrative.rootCause,
        ...narrative.contributingFactors,
        ...narrative.observedEffects,
        ...narrative.context,
      ];
      expect(all.some((e) => e.label === "Monitoring Agent Flap Count")).toBe(false);
    });
  });
});
