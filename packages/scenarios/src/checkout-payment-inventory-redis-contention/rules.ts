import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  REDIS_CONNECTION_POOL_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "checkout-api": "healthy",
  "payment-api": "healthy",
  "inventory-api": "healthy",
  redis: "healthy",
};

const contendingHealth: Record<string, ComponentHealth> = {
  "checkout-api": "healthy",
  "payment-api": "critical",
  "inventory-api": "critical",
  redis: "degraded",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "checkout-api": "healthy",
  "payment-api": "degraded",
  "inventory-api": "degraded",
  redis: "degraded",
};

/**
 * Authored rule table for the Checkout/Payment/Inventory/Redis parallel
 * reference incident, ordered most-specific-first per this codebase's
 * existing convention. Redis connection-pool capacity is the real root
 * cause shared by Payment and Inventory; Checkout stays healthy
 * throughout (it uses a separate connection pool entirely — never
 * explained to the candidate, the point is for them to notice Checkout
 * simply isn't affected); Redis CPU/memory stay normal the whole time
 * (the misleading "Redis looks fine" signal — only connection
 * utilization is the tell). The `diagnosisPath` string captures what
 * the candidate actually did by completion — correlated investigation
 * before the real fix, the real fix without investigating, or one of
 * two plausible-but-inferior single-service remediations — read
 * generically by scoring.ts via the existing finalStringEquals measure,
 * and by the post-incident narrative via roleInIncident-tagged metrics
 * (candidate-ui.ts), never a bespoke mechanism.
 *
 * Note: the engine matches rules against a CURRENT snapshot of
 * triggers/controlValues every tick (packages/simulator/src/tick.ts) —
 * there is no "control X was set before control Y" primitive, so
 * `diagnosisPath` captures WHAT the candidate correlated (investigated
 * both Payment and Inventory, not just Redis directly) by the time they
 * applied the fix, not strict temporal ordering. This is an accurate
 * reflection of what the existing rule-matching engine can express
 * without a new runtime primitive.
 */
export const contentionRules: Rule[] = [
  // ── Best path: investigated all three signal sources AND raised the
  // Redis connection pool enough to relieve contention. Both dependent
  // services recover together.
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { redisContending: true },
      controlEquals: {
        [INSPECT_PAYMENT_METRICS_KEY]: true,
        [INSPECT_INVENTORY_DEPLOYS_KEY]: true,
        [INSPECT_REDIS_CONNECTIONS_KEY]: true,
      },
      controlAtLeast: { [REDIS_CONNECTION_POOL_KEY]: 512 },
    },
    incidentState: "recovering",
    values: {
      checkoutLatencyMs: 85,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 2,
      paymentTimeoutRatePercent: 3,
      inventoryP95LatencyMs: 130,
      redisCpuPercent: 20,
      redisMemoryPercent: 36,
      redisConnectionUtilizationPercent: 35,
      monitoringAgentFlapCount: 6,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating the correlation first
  // (e.g. raised the pool size on a guess, or after inspecting only
  // Redis). The outage still resolves — the fix is the fix — but the
  // candidate never demonstrated they understood WHY, which is exactly
  // what the investigation-quality scoring dimension penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { redisContending: true },
      controlAtLeast: { [REDIS_CONNECTION_POOL_KEY]: 512 },
    },
    incidentState: "recovering",
    values: {
      checkoutLatencyMs: 85,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 2,
      paymentTimeoutRatePercent: 3,
      inventoryP95LatencyMs: 130,
      redisCpuPercent: 20,
      redisMemoryPercent: 36,
      redisConnectionUtilizationPercent: 35,
      monitoringAgentFlapCount: 6,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Inferior path A: restarted Payment pods only. Payment retries dip
  // briefly from the restart, but nothing relieved the shared Redis
  // connection pressure, so Inventory stays bad and Payment relapses.
  {
    id: "restarted-payment-only",
    when: {
      triggerEquals: { redisContending: true },
      controlEquals: { [RESTART_PAYMENT_PODS_KEY]: true },
      controlAtMost: { [REDIS_CONNECTION_POOL_KEY]: 256 },
    },
    incidentState: "degraded",
    values: {
      checkoutLatencyMs: 90,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 28,
      paymentTimeoutRatePercent: 34,
      inventoryP95LatencyMs: 1_450,
      redisCpuPercent: 19,
      redisMemoryPercent: 35,
      redisConnectionUtilizationPercent: 96,
      monitoringAgentFlapCount: 44,
      diagnosisPath: "restarted-payment-only",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path B: rolled back the Inventory deploy only. The
  // deploy was never the cause, so this does nothing for Inventory
  // latency and leaves Payment and Redis exactly as contended.
  {
    id: "rolled-back-inventory-only",
    when: {
      triggerEquals: { redisContending: true },
      controlEquals: { [ROLLBACK_INVENTORY_DEPLOY_KEY]: true },
      controlAtMost: { [REDIS_CONNECTION_POOL_KEY]: 256 },
    },
    incidentState: "degraded",
    values: {
      checkoutLatencyMs: 90,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 34,
      paymentTimeoutRatePercent: 41,
      inventoryP95LatencyMs: 1_480,
      redisCpuPercent: 19,
      redisMemoryPercent: 35,
      redisConnectionUtilizationPercent: 97,
      monitoringAgentFlapCount: 46,
      diagnosisPath: "rolled-back-inventory-only",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Partial relief: pool size raised, but not enough (256 vs. the
  // 512 actually required under this load).
  {
    id: "partial-pool-increase",
    when: {
      triggerEquals: { redisContending: true },
      controlEquals: { [REDIS_CONNECTION_POOL_KEY]: 256 },
    },
    incidentState: "degraded",
    values: {
      checkoutLatencyMs: 88,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 14,
      paymentTimeoutRatePercent: 17,
      inventoryP95LatencyMs: 680,
      redisCpuPercent: 21,
      redisMemoryPercent: 37,
      redisConnectionUtilizationPercent: 68,
      monitoringAgentFlapCount: 30,
      diagnosisPath: "partial-pool-increase",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Baseline critical: contention active, no mitigation applied yet.
  // Checkout is deliberately unaffected (separate connection pool) —
  // the misleading-healthy signal the candidate must notice is NOT the
  // cause of the outage.
  {
    id: "contention-baseline",
    when: { triggerEquals: { redisContending: true } },
    incidentState: "contending",
    values: {
      checkoutLatencyMs: 85,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 34,
      paymentTimeoutRatePercent: 41,
      inventoryP95LatencyMs: 1_480,
      redisCpuPercent: 19,
      redisMemoryPercent: 35,
      redisConnectionUtilizationPercent: 97,
      monitoringAgentFlapCount: 48,
      diagnosisPath: "not-attempted",
    },
    componentHealth: contendingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      checkoutLatencyMs: 80,
      checkoutErrorRate: 0.1,
      paymentRetryRatePercent: 2,
      paymentTimeoutRatePercent: 3,
      inventoryP95LatencyMs: 120,
      redisCpuPercent: 18,
      redisMemoryPercent: 35,
      redisConnectionUtilizationPercent: 20,
      monitoringAgentFlapCount: 2,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
