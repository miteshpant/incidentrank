import { createInitialState, simulate } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import {
  BACKOFF_KEY,
  CHECKOUT_INSTANCES_KEY,
  CIRCUIT_BREAKER_KEY,
  DB_CONNECTION_LIMIT_KEY,
  KAFKA_CONSUMERS_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
  TIMEOUT_SECONDS_KEY,
} from "./controls";
import { paymentRetryStormSimulation } from "./definition";
import { PROVIDER_RECOVERY_END_MS } from "./timed-events";
import { runScenario } from "./test-helpers";

const MINUTE_MS = 60_000;

describe("Payment Retry Storm — 1. healthy start", () => {
  it("starts healthy with the authored initial values", () => {
    const state = createInitialState(paymentRetryStormSimulation);
    expect(state.status).toBe("healthy");
    expect(state.values.checkoutSuccessRate).toBe(99.9);
    expect(state.incidentStartedAtMs).toBeNull();
  });
});

describe("Payment Retry Storm — 2. incident begins at 60 seconds", () => {
  it("degrades the provider and checkout at T=60s", () => {
    const { finalState } = runScenario(61_000);
    expect(finalState.triggers.providerDegraded).toBe(true);
    expect(finalState.status).toBe("critical");
    expect(finalState.values.checkoutSuccessRate).toBe(72);
    expect(finalState.incidentStartedAtMs).toBe(60_000);
  });

  it("remains healthy for the 59 seconds before the incident", () => {
    const { finalState } = runScenario(59_000);
    expect(finalState.status).toBe("healthy");
    expect(finalState.triggers.providerDegraded ?? false).toBe(false);
  });
});

describe("Payment Retry Storm — 3. doing nothing", () => {
  it("eventually recovers naturally with high revenue loss and long recovery time", () => {
    const { finalState } = runScenario(PROVIDER_RECOVERY_END_MS + 31_000);

    expect(finalState.triggers.providerDegraded).toBe(false);
    expect(finalState.status).toBe("resolved");
    expect(finalState.resolvedAtMs).not.toBeNull();
    expect(finalState.resolvedAtMs!).toBeGreaterThan(PROVIDER_RECOVERY_END_MS);
    expect(finalState.customerImpact.revenueLossUsd).toBeGreaterThan(100_000);
  });
});

describe("Payment Retry Storm — 4. retry reduction", () => {
  it("improves but does not immediately resolve", () => {
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
    ]);

    expect(finalState.values.checkoutSuccessRate).toBe(84);
    expect(finalState.status).not.toBe("resolved");
  });
});

describe("Payment Retry Storm — 5. retry increase", () => {
  it("makes the system worse", () => {
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 5 },
    ]);

    expect(finalState.values.checkoutSuccessRate).toBe(63);
    expect(finalState.values.paymentTraffic).toBe("critical");
    expect(finalState.values.dbPressure).toBe("critical");
  });
});

describe("Payment Retry Storm — 6. exponential backoff", () => {
  it("improves further on top of reduced retries", () => {
    const { finalState } = runScenario(120_000, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
      { atMs: 90_000, controlKey: BACKOFF_KEY, value: "exponential" },
    ]);

    expect(finalState.values.checkoutSuccessRate).toBe(92);
    expect(finalState.values.checkoutP99LatencyMs).toBeLessThan(4_200);
  });
});

describe("Payment Retry Storm — 7. circuit breaker", () => {
  it("protects downstream with fast failures but is not universally perfect", () => {
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
    ]);

    expect(finalState.values.checkoutSuccessRate).toBe(82);
    expect(finalState.values.checkoutSuccessRate).toBeLessThan(95);
    expect(finalState.values.checkoutP99LatencyMs).toBeLessThan(6_400);
  });
});

describe("Payment Retry Storm — 8. scale checkout only", () => {
  it("does not fix the root incident", () => {
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: CHECKOUT_INSTANCES_KEY, value: 24 },
    ]);

    expect(finalState.values.checkoutSuccessRate).toBe(72);
    expect(finalState.status).toBe("critical");
  });
});

describe("Payment Retry Storm — 9. scale payment aggressively while retries remain high", () => {
  it("does not solve the incident and worsens downstream pressure", () => {
    const baseline = runScenario(90_000, [
      { atMs: 65_000, controlKey: PAYMENT_INSTANCES_KEY, value: 8 },
    ]);
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: PAYMENT_INSTANCES_KEY, value: 24 },
    ]);

    expect(finalState.status).not.toBe("resolved");
    expect(Number(finalState.values.checkoutSuccessRate)).toBeLessThan(
      Number(baseline.finalState.values.checkoutSuccessRate),
    );
    expect(finalState.values.dbPressure).toBe("critical");
  });
});

describe("Payment Retry Storm — 10. kafka consumers", () => {
  it("affects kafka backlog but not checkout health directly", () => {
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: KAFKA_CONSUMERS_KEY, value: 24 },
    ]);

    expect(finalState.values.checkoutSuccessRate).toBe(72);
    expect(finalState.values.kafkaLagMessages).toBe(18_000);
  });
});

describe("Payment Retry Storm — 11. database connections", () => {
  it("may change cost while checkout incident remains unresolved", () => {
    const { finalState } = runScenario(90_000, [
      { atMs: 65_000, controlKey: DB_CONNECTION_LIMIT_KEY, value: 1000 },
    ]);

    expect(finalState.status).not.toBe("resolved");
    expect(finalState.cost.currentMonthlyCostUsd).toBeGreaterThan(
      paymentRetryStormSimulation.infrastructureCost.baselineMonthlyUsd,
    );
  });
});

describe("Payment Retry Storm — 12. timeout tradeoff", () => {
  it("produces different advantages/disadvantages for low vs. high timeout", () => {
    const low = runScenario(90_000, [
      { atMs: 65_000, controlKey: TIMEOUT_SECONDS_KEY, value: 1 },
    ]);
    const high = runScenario(90_000, [
      { atMs: 65_000, controlKey: TIMEOUT_SECONDS_KEY, value: 5 },
    ]);

    expect(Number(low.finalState.values.checkoutP99LatencyMs)).toBeLessThan(
      Number(high.finalState.values.checkoutP99LatencyMs),
    );
    expect(Number(low.finalState.values.checkoutSuccessRate)).toBeLessThan(
      Number(high.finalState.values.checkoutSuccessRate),
    );
  });
});

describe("Payment Retry Storm — 13. good recovery", () => {
  it("resolves after a sensible mitigation sequence", () => {
    const { finalState } = runScenario(240_000, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
      { atMs: 90_000, controlKey: BACKOFF_KEY, value: "exponential" },
      { atMs: 120_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
    ]);

    expect(finalState.status).toBe("resolved");
    expect(finalState.resolvedAtMs).not.toBeNull();
    expect(finalState.resolvedAtMs!).toBeLessThan(PROVIDER_RECOVERY_END_MS);
  });
});

describe("Payment Retry Storm — 14. alternative recovery", () => {
  it("resolves using a different sensible sequence", () => {
    const { finalState } = runScenario(240_000, [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 },
      { atMs: 90_000, controlKey: TIMEOUT_SECONDS_KEY, value: 3 },
      { atMs: 110_000, controlKey: BACKOFF_KEY, value: "exponential" },
      { atMs: 140_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
    ]);

    expect(finalState.status).toBe("resolved");
    expect(finalState.resolvedAtMs).not.toBeNull();
    expect(finalState.resolvedAtMs!).toBeLessThan(PROVIDER_RECOVERY_END_MS);
  });
});

describe("Payment Retry Storm — 15. bad configuration", () => {
  it("can trigger failure with a clearly harmful configuration", () => {
    const { finalState } = runScenario(66_000 + 3 * MINUTE_MS + 1_000, [
      { atMs: 65_000, controlKey: PAYMENT_INSTANCES_KEY, value: 24 },
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 5 },
    ]);

    expect(finalState.status).toBe("failed");
    expect(finalState.failedAtMs).not.toBeNull();
  });
});

describe("Payment Retry Storm — 16. invalid controls", () => {
  it("rejects an invalid retries value", () => {
    const state = createInitialState(paymentRetryStormSimulation);
    const result = simulate(
      paymentRetryStormSimulation,
      state,
      { id: "a1", timestampMs: 0, controlKey: RETRIES_KEY, value: 4 },
      1_000,
    );

    expect(result.state.controlValues[RETRIES_KEY]).toBe(3);
    expect(result.events.some((e) => e.type === "CONFIG_CHANGE_REJECTED")).toBe(
      true,
    );
  });

  it("rejects an invalid timeout value", () => {
    const state = createInitialState(paymentRetryStormSimulation);
    const result = simulate(
      paymentRetryStormSimulation,
      state,
      { id: "a1", timestampMs: 0, controlKey: TIMEOUT_SECONDS_KEY, value: 4500 },
      1_000,
    );

    expect(result.state.controlValues[TIMEOUT_SECONDS_KEY]).toBe(2);
    expect(result.events.some((e) => e.type === "CONFIG_CHANGE_REJECTED")).toBe(
      true,
    );
  });

  it("rejects an invalid payment instances value", () => {
    const state = createInitialState(paymentRetryStormSimulation);
    const result = simulate(
      paymentRetryStormSimulation,
      state,
      { id: "a1", timestampMs: 0, controlKey: PAYMENT_INSTANCES_KEY, value: 7 },
      1_000,
    );

    expect(result.state.controlValues[PAYMENT_INSTANCES_KEY]).toBe(8);
    expect(result.events.some((e) => e.type === "CONFIG_CHANGE_REJECTED")).toBe(
      true,
    );
  });
});

describe("Payment Retry Storm — 17. determinism", () => {
  it("produces identical state, events, and scoring inputs for the same action sequence", () => {
    const actions = [
      { atMs: 65_000, controlKey: RETRIES_KEY, value: 1 as const },
      { atMs: 90_000, controlKey: BACKOFF_KEY, value: "exponential" as const },
      { atMs: 120_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" as const },
    ];

    const runA = runScenario(200_000, actions);
    const runB = runScenario(200_000, actions);

    expect(runA.finalState).toEqual(runB.finalState);
    expect(runA.allEvents).toEqual(runB.allEvents);
  });
});
