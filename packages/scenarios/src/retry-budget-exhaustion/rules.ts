import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CIRCUIT_BREAKER_ENABLED_KEY,
  INSPECT_RETRY_METRICS_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  PRICING_SERVICE_REPLICA_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "recommendation-service": "healthy",
  "pricing-service": "healthy",
};

const amplifyingHealth: Record<string, ComponentHealth> = {
  "recommendation-service": "degraded",
  "pricing-service": "critical",
};

const partiallyRelievedHealth: Record<string, ComponentHealth> = {
  "recommendation-service": "degraded",
  "pricing-service": "degraded",
};

/**
 * Authored rule table for Retry Budget Exhaustion. This is a single-hop,
 * introductory amplification lesson (one client, one downstream
 * dependency) — deliberately simpler than the multi-service retry-
 * amplification scenarios elsewhere in the catalog
 * (cross-service-retry-amplification, expensive-retry-and-logging-
 * amplification), which require reasoning across several independently
 * retrying layers. Here there is exactly one retrying layer
 * (Recommendation Service) and exactly one degraded dependency (Pricing
 * Service): the candidate only needs to recognize that a client with no
 * retry budget and no circuit breaker turns a MODERATE dependency
 * degradation into a SEVERE one, because every failed call is
 * automatically re-issued up to maxRetryAttempts times, multiplying
 * Pricing Service's received load far beyond what the degraded
 * dependency itself ever experiences from real customer traffic.
 *
 * Root cause: the retry policy itself (maxRetryAttempts with no circuit
 * breaker), not Pricing Service's underlying degradation, which is a
 * fixed, candidate-uncontrollable fact of this incident (its own
 * database is under maintenance load) — the candidate cannot fix
 * Pricing Service directly, only stop amplifying load onto it.
 *
 * The `diagnosisPath` string captures what the candidate actually did by
 * completion, read generically by scoring.ts via the existing
 * finalStringEquals measure, and by the post-incident narrative via
 * roleInIncident-tagged metrics (candidate-ui.ts) — never a bespoke
 * mechanism, mirroring the reference incident exactly.
 */
export const retryBudgetExhaustionRules: Rule[] = [
  // ── Best path: investigated the retry metrics AND applied the correct
  // fix (bounded retries + circuit breaker enabled). Pricing Service
  // recovers because Recommendation Service stops amplifying load into
  // it once calls start failing.
  {
    id: "correlated-then-fixed",
    when: {
      triggerEquals: { pricingDegraded: true },
      controlEquals: {
        [INSPECT_RETRY_METRICS_KEY]: true,
        [CIRCUIT_BREAKER_ENABLED_KEY]: true,
      },
      controlAtMost: { [MAX_RETRY_ATTEMPTS_KEY]: 1 },
    },
    incidentState: "recovering",
    values: {
      recommendationLatencyMs: 65,
      recommendationErrorRate: 0.2,
      pricingCallVolumeMultiplier: 1,
      pricingErrorRatePercent: 3,
      pricingP95LatencyMs: 110,
      retryAmplificationRatio: 1,
      deployPipelineQueueDepth: 9,
      diagnosisPath: "correlated-then-fixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Correct fix, applied without investigating the retry metrics
  // first (e.g. enabled the circuit breaker and bounded retries on a
  // guess). The incident still resolves — the fix is the fix — but the
  // candidate never demonstrated they understood WHY, which is exactly
  // what the investigation-quality dimension penalizes.
  {
    id: "guessed-fix",
    when: {
      triggerEquals: { pricingDegraded: true },
      controlEquals: { [CIRCUIT_BREAKER_ENABLED_KEY]: true },
      controlAtMost: { [MAX_RETRY_ATTEMPTS_KEY]: 1 },
    },
    incidentState: "recovering",
    values: {
      recommendationLatencyMs: 65,
      recommendationErrorRate: 0.2,
      pricingCallVolumeMultiplier: 1,
      pricingErrorRatePercent: 3,
      pricingP95LatencyMs: 110,
      retryAmplificationRatio: 1,
      deployPipelineQueueDepth: 9,
      diagnosisPath: "guessed-fix",
    },
    componentHealth: healthyHealth,
  },

  // ── Partial relief: retries bounded to at most 1 attempt, but the
  // circuit breaker is still off. A single bounded retry per call is a
  // real improvement over 3-5 unbounded retries, but Recommendation
  // Service still re-issues every failing call once, so Pricing Service
  // stays under real (if reduced) amplified load.
  {
    id: "bounded-retries-no-breaker",
    when: {
      triggerEquals: { pricingDegraded: true },
      controlAtMost: { [MAX_RETRY_ATTEMPTS_KEY]: 1 },
      controlEquals: { [CIRCUIT_BREAKER_ENABLED_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      recommendationLatencyMs: 140,
      recommendationErrorRate: 1.5,
      pricingCallVolumeMultiplier: 2,
      pricingErrorRatePercent: 22,
      pricingP95LatencyMs: 640,
      retryAmplificationRatio: 2,
      deployPipelineQueueDepth: 14,
      diagnosisPath: "bounded-retries-no-breaker",
    },
    componentHealth: partiallyRelievedHealth,
  },

  // ── Inferior path: scaled out Pricing Service replicas instead of
  // touching the retry policy. Plausible — more capacity should help —
  // but retry amplification is still multiplying load with every
  // unbounded retry, and it outpaces the added capacity: going from 4 to
  // even 32 replicas never relieves the incident while maxRetryAttempts
  // stays at its default of 3.
  {
    id: "scaled-pricing-only",
    when: {
      triggerEquals: { pricingDegraded: true },
      controlAtLeast: { [PRICING_SERVICE_REPLICA_COUNT_KEY]: 8 },
      controlEquals: { [CIRCUIT_BREAKER_ENABLED_KEY]: false },
    },
    incidentState: "degraded",
    values: {
      recommendationLatencyMs: 260,
      recommendationErrorRate: 3.4,
      pricingCallVolumeMultiplier: 3,
      pricingErrorRatePercent: 38,
      pricingP95LatencyMs: 1_350,
      retryAmplificationRatio: 3,
      deployPipelineQueueDepth: 19,
      diagnosisPath: "scaled-pricing-only",
    },
    componentHealth: amplifyingHealth,
  },

  // ── Baseline critical: Pricing degradation active, retry policy
  // unchanged (3 unbounded attempts, no circuit breaker). Every failed
  // call is retried up to 3 times, so Pricing Service receives roughly
  // 3x the real customer call volume — the amplification the candidate
  // must recognize and stop.
  {
    id: "amplification-baseline",
    when: { triggerEquals: { pricingDegraded: true } },
    incidentState: "amplifying",
    values: {
      recommendationLatencyMs: 310,
      recommendationErrorRate: 4.1,
      pricingCallVolumeMultiplier: 3,
      pricingErrorRatePercent: 41,
      pricingP95LatencyMs: 1_480,
      retryAmplificationRatio: 3,
      deployPipelineQueueDepth: 21,
      diagnosisPath: "not-attempted",
    },
    componentHealth: amplifyingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      recommendationLatencyMs: 60,
      recommendationErrorRate: 0.2,
      pricingCallVolumeMultiplier: 1,
      pricingErrorRatePercent: 2,
      pricingP95LatencyMs: 90,
      retryAmplificationRatio: 1,
      deployPipelineQueueDepth: 3,
      diagnosisPath: "not-attempted",
    },
    componentHealth: healthyHealth,
  },
];
