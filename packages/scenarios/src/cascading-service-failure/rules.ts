import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "healthy",
  "order-service": "healthy",
  "user-profile-service": "healthy",
  "profile-database": "healthy",
};

const isolatedRootHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "healthy",
  "order-service": "healthy",
  "user-profile-service": "critical",
  "profile-database": "degraded",
};

const partialHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "checkout-service": "degraded",
  "order-service": "degraded",
  "user-profile-service": "critical",
  "profile-database": "degraded",
};

const cascadingHealth: Record<string, ComponentHealth> = {
  "api-gateway": "degraded",
  "checkout-service": "critical",
  "order-service": "critical",
  "user-profile-service": "critical",
  "profile-database": "degraded",
};

/**
 * Authored rule table for Cascading Service Failure, ordered
 * most-specific-first. Encodes a harmful trap (restarting the healthy
 * upstream services that are only blocked, not actually broken, while
 * the real root cause stays untouched), a clean isolation path (a
 * correctly-scoped circuit breaker around the one actually-failing
 * service lets upstream services recover even though the root service
 * itself is still unhealthy underneath), two partial paths, a
 * baseline-critical default, and a wider-cascade default once the
 * second timed event fires.
 */
export const cascadeRules: Rule[] = [
  // ── Harmful: restarting the upstream (symptom) services while the
  // root cause is untouched — rootServiceErrorRate is completely
  // unaffected since those services were never actually broken, and the
  // restart churn briefly widens the visible cascade instead of fixing
  // anything.
  {
    id: "restart-symptoms-harmful",
    when: {
      triggerEquals: { rootFailureActive: true },
      controlEquals: {
        [UPSTREAM_SERVICE_RESTART_ENABLED_KEY]: true,
        [ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY]: false,
      },
    },
    incidentState: "wasted-restart",
    values: {
      rootServiceErrorRate: 95,
      cascadeDepth: 4,
      aggregateQueueDepth: 3_200,
      checkoutSuccessRate: 38,
      chainStatus: "critical",
    },
    componentHealth: cascadingHealth,
  },

  // ── Good recovery: the root-cause service gets correctly isolated via
  // a circuit breaker — upstream callers fail fast instead of blocking,
  // checkout recovers, even though user-profile-service itself is still
  // unhealthy underneath (rootServiceErrorRate intentionally stays high
  // here, proving the fix isolates the failure rather than pretending
  // to have fixed the root cause).
  {
    id: "root-isolated-recovery",
    when: {
      triggerEquals: { rootFailureActive: true },
      controlEquals: { [ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY]: true },
      controlAtMost: { [REQUEST_QUEUE_DEPTH_LIMIT_KEY]: 1_000 },
    },
    incidentState: "recovering",
    values: {
      rootServiceErrorRate: 95,
      cascadeDepth: 1,
      aggregateQueueDepth: 60,
      checkoutSuccessRate: 99.5,
      chainStatus: "warning",
    },
    componentHealth: isolatedRootHealth,
  },

  // ── Partial: circuit breaker on, but the queue depth limit is left
  // very high — recovers, but slower and noisier, since each upstream
  // service still queues a large backlog before the breaker trips
  // consistently.
  {
    id: "root-isolated-high-queue-limit",
    when: {
      triggerEquals: { rootFailureActive: true },
      controlEquals: { [ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY]: true },
      controlAtLeast: { [REQUEST_QUEUE_DEPTH_LIMIT_KEY]: 5_000 },
    },
    incidentState: "degraded",
    values: {
      rootServiceErrorRate: 95,
      cascadeDepth: 2,
      aggregateQueueDepth: 1_800,
      checkoutSuccessRate: 82,
      chainStatus: "warning",
    },
    componentHealth: partialHealth,
  },

  // ── Smaller partial: circuit breaker still off, but a tight queue
  // depth limit sheds load early and prevents total collapse — checkout
  // stays degraded rather than fully down.
  {
    id: "queue-limit-only",
    when: {
      triggerEquals: { rootFailureActive: true },
      controlAtMost: { [REQUEST_QUEUE_DEPTH_LIMIT_KEY]: 200 },
    },
    incidentState: "degraded",
    values: {
      rootServiceErrorRate: 95,
      cascadeDepth: 3,
      aggregateQueueDepth: 400,
      checkoutSuccessRate: 65,
      chainStatus: "critical",
    },
    componentHealth: partialHealth,
  },

  // ── Baseline critical once the cascade has widened (second timed
  // event) and still no mitigation — worse than the initial baseline.
  {
    id: "cascade-widened-default",
    when: { triggerEquals: { rootFailureActive: true, cascadeWidened: true } },
    incidentState: "wide-cascade",
    values: {
      rootServiceErrorRate: 98,
      cascadeDepth: 5,
      aggregateQueueDepth: 4_500,
      checkoutSuccessRate: 20,
      chainStatus: "critical",
    },
    componentHealth: cascadingHealth,
  },

  // ── Baseline critical: root failure active, no mitigation yet.
  {
    id: "cascade-critical-default",
    when: { triggerEquals: { rootFailureActive: true } },
    incidentState: "cascading",
    values: {
      rootServiceErrorRate: 95,
      cascadeDepth: 3,
      aggregateQueueDepth: 2_200,
      checkoutSuccessRate: 55,
      chainStatus: "critical",
    },
    componentHealth: cascadingHealth,
  },

  // ── Default/fallback: no root failure active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      rootServiceErrorRate: 0.1,
      cascadeDepth: 0,
      aggregateQueueDepth: 20,
      checkoutSuccessRate: 99.9,
      chainStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
