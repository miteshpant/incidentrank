import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKOFF_KEY,
  CIRCUIT_BREAKER_KEY,
  RETRIES_KEY,
  TIMEOUT_SECONDS_KEY,
  PAYMENT_INSTANCES_KEY,
} from "./controls";

const degradedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "degraded",
  "payment-service": "critical",
  "payment-provider": "critical",
  postgres: "degraded",
  kafka: "degraded",
  "settlement-worker": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  ...degradedHealth,
  "checkout-service": "critical",
  postgres: "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "healthy",
  "payment-service": "degraded",
  "payment-provider": "degraded",
  postgres: "healthy",
  kafka: "degraded",
  "settlement-worker": "degraded",
};

/**
 * Authored rule table for the degraded-provider branch, ordered
 * most-specific-first. Each rule's `values` is a fixed, authored snapshot
 * — never derived from a formula. This directly encodes the scenario's
 * Paths A-D plus the good-recovery and timeout-tradeoff narratives.
 */
export const degradedRules: Rule[] = [
  // ── Path D + good recovery: circuit breaker on, retries low, exponential backoff
  {
    id: "circuit-breaker-good-recovery",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: { [CIRCUIT_BREAKER_KEY]: "on", [BACKOFF_KEY]: "exponential" },
      controlAtMost: { [RETRIES_KEY]: 1 },
    },
    incidentState: "recovering",
    values: {
      checkoutSuccessRate: 96,
      checkoutP99LatencyMs: 1_600,
      paymentProviderLatencyMs: 1_800,
      paymentTraffic: "normal",
      dbPressure: "normal",
      kafkaLagMessages: 2_000,
    },
    componentHealth: recoveringHealth,
  },

  // ── Path D: circuit breaker on, but retries still poor (fail-fast, not resolved)
  {
    id: "circuit-breaker-poor-retries",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: { [CIRCUIT_BREAKER_KEY]: "on" },
    },
    incidentState: "storm-controlled",
    values: {
      checkoutSuccessRate: 82,
      checkoutP99LatencyMs: 1_200,
      paymentProviderLatencyMs: 2_600,
      paymentTraffic: "warning",
      dbPressure: "warning",
      kafkaLagMessages: 9_000,
    },
    componentHealth: degradedHealth,
  },

  // ── Path C: low retries + exponential backoff (no circuit breaker)
  {
    id: "low-retries-exponential-backoff",
    when: {
      triggerEquals: { providerDegraded: true },
      controlEquals: { [BACKOFF_KEY]: "exponential" },
      controlAtMost: { [RETRIES_KEY]: 1 },
    },
    incidentState: "storm-reduced",
    values: {
      checkoutSuccessRate: 92,
      checkoutP99LatencyMs: 2_800,
      paymentProviderLatencyMs: 2_100,
      paymentTraffic: "warning",
      dbPressure: "warning",
      kafkaLagMessages: 11_000,
    },
    componentHealth: degradedHealth,
  },

  // ── Path B: low retries, no backoff benefit yet
  {
    id: "low-retries-no-backoff",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtMost: { [RETRIES_KEY]: 1 },
    },
    incidentState: "storm-reduced",
    values: {
      checkoutSuccessRate: 84,
      checkoutP99LatencyMs: 4_200,
      paymentProviderLatencyMs: 3_400,
      paymentTraffic: "warning",
      dbPressure: "warning",
      kafkaLagMessages: 14_000,
    },
    componentHealth: degradedHealth,
  },

  // ── Aggressive payment scaling while retries remain high: worse, not better
  {
    id: "aggressive-scaling-high-retries",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtLeast: { [RETRIES_KEY]: 3, [PAYMENT_INSTANCES_KEY]: 16 },
    },
    incidentState: "storm-critical",
    values: {
      checkoutSuccessRate: 58,
      checkoutP99LatencyMs: 8_200,
      paymentProviderLatencyMs: 5_600,
      paymentTraffic: "critical",
      dbPressure: "critical",
      kafkaLagMessages: 24_000,
    },
    componentHealth: criticalHealth,
  },

  // ── Path A worse case: retries increased to 5
  {
    id: "high-retries-worse",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtLeast: { [RETRIES_KEY]: 5 },
    },
    incidentState: "storm-critical",
    values: {
      checkoutSuccessRate: 63,
      checkoutP99LatencyMs: 7_800,
      paymentProviderLatencyMs: 5_200,
      paymentTraffic: "critical",
      dbPressure: "critical",
      kafkaLagMessages: 21_000,
    },
    componentHealth: criticalHealth,
  },

  // ── Timeout tradeoff: very low timeout fails fast, success drops further,
  // but latency improves even at default retries/backoff.
  {
    id: "low-timeout-tradeoff",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtMost: { [TIMEOUT_SECONDS_KEY]: 1 },
    },
    incidentState: "storm-critical",
    values: {
      checkoutSuccessRate: 66,
      checkoutP99LatencyMs: 2_200,
      paymentProviderLatencyMs: 4_800,
      paymentTraffic: "critical",
      dbPressure: "warning",
      kafkaLagMessages: 16_000,
    },
    componentHealth: criticalHealth,
  },

  // ── Timeout tradeoff: high timeout keeps requests tied up longer, worse P99
  {
    id: "high-timeout-tradeoff",
    when: {
      triggerEquals: { providerDegraded: true },
      controlAtLeast: { [TIMEOUT_SECONDS_KEY]: 5 },
    },
    incidentState: "storm-critical",
    values: {
      checkoutSuccessRate: 74,
      checkoutP99LatencyMs: 7_200,
      paymentProviderLatencyMs: 4_800,
      paymentTraffic: "critical",
      dbPressure: "warning",
      kafkaLagMessages: 19_000,
    },
    componentHealth: criticalHealth,
  },

  // ── Path A default: provider degraded, retries >= 3, backoff none (baseline critical)
  {
    id: "storm-critical-default",
    when: { triggerEquals: { providerDegraded: true } },
    incidentState: "storm-critical",
    values: {
      checkoutSuccessRate: 72,
      checkoutP99LatencyMs: 6_400,
      paymentProviderLatencyMs: 4_800,
      paymentTraffic: "critical",
      dbPressure: "critical",
      kafkaLagMessages: 18_000,
    },
    componentHealth: criticalHealth,
  },
];
