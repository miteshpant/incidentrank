import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import { CIRCUIT_BREAKER_ENABLED_KEY, REQUEST_TIMEOUT_MS_KEY } from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "calling-service": "healthy",
  "downstream-service": "healthy",
  "fallback-cache": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "calling-service": "degraded",
  "downstream-service": "critical",
  "fallback-cache": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-gateway": "degraded",
  "calling-service": "critical",
  "downstream-service": "critical",
  "fallback-cache": "healthy",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "calling-service": "healthy",
  "downstream-service": "critical",
  "fallback-cache": "healthy",
};

/**
 * Authored rule table for Downstream Dependency Failure, ordered
 * most-specific-first. Encodes a harmful trap (lengthening the request
 * timeout while the circuit breaker stays closed — each blocked call now
 * ties up calling-service capacity even longer), a clean full-recovery
 * path (opening the circuit breaker stops the calling service from
 * wasting its own capacity on calls that will fail anyway, regardless of
 * timeout/fallback settings), a smaller partial improvement (shortening
 * the timeout alone, without the circuit breaker, fails faster per call
 * but still wastes capacity on every doomed call), a baseline-critical
 * default, and a healthy fallback.
 */
export const dependencyRules: Rule[] = [
  // ── Harmful: lengthening the request timeout while the circuit
  // breaker stays closed — each call to the dead downstream now blocks
  // calling-service capacity for even longer before failing, worsening
  // thread pool exhaustion instead of relieving it.
  {
    id: "long-timeout-no-breaker-harmful",
    when: {
      triggerEquals: { downstreamFailing: true },
      controlAtLeast: { [REQUEST_TIMEOUT_MS_KEY]: 20_000 },
      controlEquals: { [CIRCUIT_BREAKER_ENABLED_KEY]: false },
    },
    incidentState: "exhausting",
    values: {
      callingServiceThreadPoolUtilization: 99,
      requestLatencyP99Ms: 19_500,
      failedRequestRate: 45,
      queuedRequests: 620,
      callingServiceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: the circuit breaker is open — the calling service
  // stops sending requests to a known-dead dependency and fails fast,
  // freeing its own capacity regardless of timeout/fallback settings.
  {
    id: "circuit-breaker-recovery",
    when: {
      triggerEquals: { downstreamFailing: true },
      controlEquals: { [CIRCUIT_BREAKER_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      callingServiceThreadPoolUtilization: 25,
      requestLatencyP99Ms: 60,
      failedRequestRate: 1,
      queuedRequests: 0,
      callingServiceStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial improvement: timeout shortened, circuit breaker still
  // off — each doomed call fails faster, but the calling service is
  // still spending capacity on every one of them.
  {
    id: "short-timeout-no-breaker-partial",
    when: {
      triggerEquals: { downstreamFailing: true },
      controlAtMost: { [REQUEST_TIMEOUT_MS_KEY]: 500 },
    },
    incidentState: "degraded",
    values: {
      callingServiceThreadPoolUtilization: 70,
      requestLatencyP99Ms: 480,
      failedRequestRate: 30,
      queuedRequests: 180,
      callingServiceStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: downstream failing, no mitigation, default
  // timeout, circuit breaker off.
  {
    id: "exhaustion-critical-default",
    when: { triggerEquals: { downstreamFailing: true } },
    incidentState: "exhausting",
    values: {
      callingServiceThreadPoolUtilization: 92,
      requestLatencyP99Ms: 2_000,
      failedRequestRate: 40,
      queuedRequests: 450,
      callingServiceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: downstream healthy.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      callingServiceThreadPoolUtilization: 20,
      requestLatencyP99Ms: 80,
      failedRequestRate: 0.1,
      queuedRequests: 0,
      callingServiceStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
