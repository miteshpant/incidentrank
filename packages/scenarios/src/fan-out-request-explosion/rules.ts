import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ENRICHMENT_CALL_ENABLED_KEY,
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  PARTIAL_RESPONSE_POLICY_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  aggregator: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-d": "healthy",
  "service-e": "healthy",
};

const eDegradedOnlyHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  aggregator: "degraded",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-d": "healthy",
  "service-e": "critical",
};

const eExcludedHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  aggregator: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-d": "healthy",
  "service-e": "degraded",
};

const aAtRiskHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  aggregator: "degraded",
  "service-a": "degraded",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-d": "healthy",
  "service-e": "critical",
};

const aCriticalHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  aggregator: "critical",
  "service-a": "critical",
  "service-b": "healthy",
  "service-c": "healthy",
  "service-d": "healthy",
  "service-e": "critical",
};

/**
 * Authored rule table for Fan-Out Request Explosion, ordered
 * most-specific first. A request-path change widens the product-detail
 * fan-out to all five downstream services; Service E (recommendation
 * enrichment, optional) then degrades under the increased call volume.
 * Core functionality (pricing/inventory/shipping/tax, Services A-D) can
 * be fully preserved by excluding the optional enrichment call. A
 * secondary pressure-transfer path exists: batching downstream calls
 * relieves Service E's load (and aggregator latency generally), but
 * because batched lookups resolve per-item pricing against Service A
 * synchronously, batching concentrates more simultaneous work onto
 * Service A — a CORE dependency with its own bounded capacity. Pushing
 * fan-out concurrency up on top of batching drives Service A into
 * critical saturation, breaking a core path while chasing relief from
 * the optional one.
 */
export const fanOutRequestExplosionRules: Rule[] = [
  // ── Strong, direct recovery: Service E is excluded from the fan-out
  // entirely. Core path (A-D) never sees any additional pressure from
  // this change, enrichment content is simply absent from the response,
  // and the whole thing is stable regardless of concurrency/batching/
  // cache settings. This is intentionally the first trigger-gated rule
  // so it wins over every other control combination below once
  // enrichment is excluded.
  {
    id: "enrichment-excluded-core-intact",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlEquals: { [ENRICHMENT_CALL_ENABLED_KEY]: false },
    },
    incidentState: "enrichment-excluded",
    values: {
      requestsPerUserRequest: 4,
      downstreamQpsServiceE: 0,
      downstreamQpsServiceA: 85,
      aggregatorLatencyMs: 85,
      partialResponseRatePercent: 0,
      serviceESaturationPercent: 0,
      serviceASaturationPercent: 10,
      customerSuccessRatePercent: 99.6,
      aggregatorStatus: "normal",
      corePathHealth: "core-path-intact",
    },
    componentHealth: eExcludedHealth,
  },

  // ── Alternate strong recovery: enrichment stays included, but the
  // aggregator tolerates a missing/slow enrichment result (partial
  // responses allowed) and cuts the Service E timeout aggressively
  // short, so a slow Service E call never holds up the response.
  // Customer success and aggregator latency recover to essentially the
  // same level as excluding the call outright — a genuinely different,
  // equally safe strategy.
  {
    id: "partial-response-short-timeout-alternate-recovery",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlEquals: {
        [ENRICHMENT_CALL_ENABLED_KEY]: true,
        [PARTIAL_RESPONSE_POLICY_KEY]: "partialAllowed",
        [SERVICE_E_TIMEOUT_MS_KEY]: 300,
      },
    },
    incidentState: "partial-response-recovery",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 80,
      downstreamQpsServiceA: 85,
      aggregatorLatencyMs: 95,
      partialResponseRatePercent: 22,
      serviceESaturationPercent: 92,
      serviceASaturationPercent: 10,
      customerSuccessRatePercent: 99.4,
      aggregatorStatus: "normal",
      corePathHealth: "core-path-intact",
    },
    componentHealth: eDegradedOnlyHealth,
  },

  // ── Harmful compound trap: batching is on AND fan-out concurrency has
  // been pushed up to try to "push through" the remaining pressure.
  // Batched per-item pricing lookups resolve synchronously against
  // Service A; raising concurrency on top of batching multiplies how
  // many of those synchronous batch-pricing calls run at once, driving
  // Service A itself into critical saturation. The optional service's
  // symptoms look better (fewer raw enrichment calls), but now a CORE
  // dependency is failing.
  {
    id: "batching-plus-high-concurrency-breaks-core",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlEquals: { [REQUEST_BATCHING_ENABLED_KEY]: true },
      controlAtLeast: { [FAN_OUT_CONCURRENCY_LIMIT_KEY]: 200 },
    },
    incidentState: "core-path-broken",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 40,
      downstreamQpsServiceA: 310,
      aggregatorLatencyMs: 1_850,
      partialResponseRatePercent: 48,
      serviceESaturationPercent: 70,
      serviceASaturationPercent: 97,
      customerSuccessRatePercent: 54,
      aggregatorStatus: "critical",
      corePathHealth: "core-path-at-risk",
    },
    componentHealth: aCriticalHealth,
  },

  // ── Genuine second-decision recovery: batching relieves Service E's
  // load, and the candidate additionally caches enrichment responses,
  // which cuts how many items need a live per-item batch-pricing join —
  // relieving the Service A pressure that batching alone introduces.
  // Concurrency stays at a modest level (never pushed into the trap
  // above). This is the alternate route to full recovery that keeps
  // enrichment live rather than excluding it.
  {
    id: "batching-plus-cache-full-recovery",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlEquals: {
        [REQUEST_BATCHING_ENABLED_KEY]: true,
        [RESPONSE_CACHE_ENABLED_KEY]: true,
      },
      controlAtMost: { [FAN_OUT_CONCURRENCY_LIMIT_KEY]: 100 },
    },
    incidentState: "batching-cache-recovered",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 18,
      downstreamQpsServiceA: 95,
      aggregatorLatencyMs: 90,
      partialResponseRatePercent: 1,
      serviceESaturationPercent: 20,
      serviceASaturationPercent: 22,
      customerSuccessRatePercent: 99.3,
      aggregatorStatus: "normal",
      corePathHealth: "core-path-intact",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial, still at risk: batching alone (no cache) relieves
  // Service E noticeably and improves customer success from baseline,
  // but Service A saturation has climbed into a warning band as a
  // direct, visible consequence — the secondary subsystem the candidate
  // must still address. Not yet safe to hand back.
  {
    id: "batching-alone-pressures-service-a",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlEquals: { [REQUEST_BATCHING_ENABLED_KEY]: true },
    },
    incidentState: "batching-shifts-pressure",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 22,
      downstreamQpsServiceA: 240,
      aggregatorLatencyMs: 420,
      partialResponseRatePercent: 9,
      serviceESaturationPercent: 24,
      serviceASaturationPercent: 68,
      customerSuccessRatePercent: 91,
      aggregatorStatus: "warning",
      corePathHealth: "core-path-at-risk",
    },
    componentHealth: aAtRiskHealth,
  },

  // ── Harmful: fan-out concurrency raised alone while Service E is
  // still degraded and included. More requests are now allowed to pile
  // onto the already-slow Service E concurrently (worse saturation, not
  // better), and the extra concurrent load also raises Service A's
  // saturation even though nothing was done to help it.
  {
    id: "raised-concurrency-worsens-both",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlAtLeast: { [FAN_OUT_CONCURRENCY_LIMIT_KEY]: 200 },
      controlEquals: { [ENRICHMENT_CALL_ENABLED_KEY]: true },
    },
    incidentState: "concurrency-worsens-contention",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 310,
      downstreamQpsServiceA: 310,
      aggregatorLatencyMs: 2_600,
      partialResponseRatePercent: 61,
      serviceESaturationPercent: 99,
      serviceASaturationPercent: 72,
      customerSuccessRatePercent: 41,
      aggregatorStatus: "critical",
      corePathHealth: "core-path-at-risk",
    },
    componentHealth: aAtRiskHealth,
  },

  // ── Partial relief: response cache alone (enrichment still included,
  // no batching). Repeat identical recommendation lookups are served
  // from cache, giving real but incomplete relief — a cold cache miss
  // under live load still calls the degraded Service E directly.
  {
    id: "cache-alone-partial-relief",
    when: {
      triggerEquals: { serviceEDegraded: true },
      controlEquals: {
        [RESPONSE_CACHE_ENABLED_KEY]: true,
        [REQUEST_BATCHING_ENABLED_KEY]: false,
        [ENRICHMENT_CALL_ENABLED_KEY]: true,
      },
    },
    incidentState: "cache-partial-relief",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 45,
      downstreamQpsServiceA: 85,
      aggregatorLatencyMs: 680,
      partialResponseRatePercent: 14,
      serviceESaturationPercent: 58,
      serviceASaturationPercent: 11,
      customerSuccessRatePercent: 85,
      aggregatorStatus: "warning",
      corePathHealth: "core-path-intact",
    },
    componentHealth: eDegradedOnlyHealth,
  },

  // ── Baseline critical: fan-out has widened, Service E has degraded,
  // and no meaningfully mitigating action has been taken. The
  // aggregator waits on all five calls including the slow one, so
  // latency balloons and the whole request fails whenever Service E
  // times out under the default fail-whole policy.
  {
    id: "service-e-degraded-baseline",
    when: { triggerEquals: { serviceEDegraded: true } },
    incidentState: "service-e-degraded",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 310,
      downstreamQpsServiceA: 85,
      aggregatorLatencyMs: 2_400,
      partialResponseRatePercent: 58,
      serviceESaturationPercent: 96,
      serviceASaturationPercent: 12,
      customerSuccessRatePercent: 44,
      aggregatorStatus: "critical",
      corePathHealth: "core-path-intact",
    },
    componentHealth: eDegradedOnlyHealth,
  },

  // ── Early warning: fan-out has widened but Service E has not yet
  // degraded. Downstream QPS and request fan-out are visibly up across
  // the board, giving the candidate a legitimate early signal before
  // Service E's own degradation lands.
  {
    id: "fan-out-widened-pre-degradation",
    when: { triggerEquals: { fanOutWidened: true } },
    incidentState: "fan-out-widened",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 180,
      downstreamQpsServiceA: 85,
      aggregatorLatencyMs: 240,
      partialResponseRatePercent: 2,
      serviceESaturationPercent: 55,
      serviceASaturationPercent: 12,
      customerSuccessRatePercent: 97,
      aggregatorStatus: "warning",
      corePathHealth: "core-path-intact",
    },
    componentHealth: {
      api: "healthy",
      aggregator: "degraded",
      "service-a": "healthy",
      "service-b": "healthy",
      "service-c": "healthy",
      "service-d": "healthy",
      "service-e": "degraded",
    },
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestsPerUserRequest: 5,
      downstreamQpsServiceE: 80,
      downstreamQpsServiceA: 80,
      aggregatorLatencyMs: 90,
      partialResponseRatePercent: 0,
      serviceESaturationPercent: 10,
      serviceASaturationPercent: 8,
      customerSuccessRatePercent: 99.5,
      aggregatorStatus: "normal",
      corePathHealth: "core-path-intact",
    },
    componentHealth: healthyHealth,
  },
];
