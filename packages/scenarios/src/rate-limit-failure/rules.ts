import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  REQUEST_CONCURRENCY_KEY,
  RETRY_BACKOFF_STRATEGY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "client-service": "healthy",
  "token-bucket-limiter": "healthy",
  "payment-verification-api": "healthy",
  "retry-queue": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "client-service": "degraded",
  "token-bucket-limiter": "degraded",
  "payment-verification-api": "degraded",
  "retry-queue": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "client-service": "critical",
  "token-bucket-limiter": "critical",
  "payment-verification-api": "critical",
  "retry-queue": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "client-service": "healthy",
  "token-bucket-limiter": "healthy",
  "payment-verification-api": "healthy",
  "retry-queue": "healthy",
};

/**
 * Authored rule table for Rate-Limit Failure, ordered most-specific-first.
 * Encodes a harmful trap (raising request concurrency with no backoff
 * strategy floods the rate limiter even harder and extends the throttle
 * window), a clean recovery path (proactive client-side rate limiting
 * plus exponential-with-jitter backoff), two partial-improvement paths
 * (exponential backoff alone, or fixed-delay backoff alone), an
 * escalation once the provider tightens its limit further, a
 * baseline-critical default, and a healthy fallback.
 */
export const rateLimitRules: Rule[] = [
  // ── Harmful: more parallel outbound requests with no backoff — every
  // retried request lands immediately, worsening the violation rate and
  // extending the throttle window instead of letting it clear.
  {
    id: "concurrency-without-backoff-harmful",
    when: {
      triggerEquals: { rateLimited: true },
      controlEquals: { [RETRY_BACKOFF_STRATEGY_KEY]: "none" },
      controlAtLeast: { [REQUEST_CONCURRENCY_KEY]: 16 },
    },
    incidentState: "escalating-violations",
    values: {
      rateLimitViolationRate: 68,
      effectiveThroughput: 90,
      retryQueueDepth: 640,
      throttleWindowRemainingMs: 45_000,
      rateLimitStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: proactive client-side rate limiting, honoring the
  // provider's actual allowed rate, plus exponential-with-jitter backoff
  // so any residual 429s spread out instead of resynchronizing.
  {
    id: "client-side-limit-with-jitter-recovery",
    when: {
      triggerEquals: { rateLimited: true },
      controlEquals: {
        [CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY]: true,
        [RETRY_BACKOFF_STRATEGY_KEY]: "exponential-with-jitter",
      },
    },
    incidentState: "recovering",
    values: {
      rateLimitViolationRate: 0.3,
      effectiveThroughput: 470,
      retryQueueDepth: 3,
      throttleWindowRemainingMs: 0,
      rateLimitStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial improvement: exponential-with-jitter backoff alone,
  // without proactive client-side limiting — violations keep occurring
  // but retries no longer resynchronize into a new burst, so the window
  // can shrink over time.
  {
    id: "jitter-backoff-only-partial",
    when: {
      triggerEquals: { rateLimited: true },
      controlEquals: { [RETRY_BACKOFF_STRATEGY_KEY]: "exponential-with-jitter" },
    },
    incidentState: "degraded",
    values: {
      rateLimitViolationRate: 14,
      effectiveThroughput: 320,
      retryQueueDepth: 90,
      throttleWindowRemainingMs: 8_000,
      rateLimitStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Smaller partial improvement: fixed-delay backoff — better than no
  // backoff at all, but a fixed delay can still synchronize retries into
  // a burst and re-trigger the limit.
  {
    id: "fixed-delay-backoff-smaller-partial",
    when: {
      triggerEquals: { rateLimited: true },
      controlEquals: { [RETRY_BACKOFF_STRATEGY_KEY]: "fixed-delay" },
    },
    incidentState: "degraded",
    values: {
      rateLimitViolationRate: 28,
      effectiveThroughput: 220,
      retryQueueDepth: 220,
      throttleWindowRemainingMs: 18_000,
      rateLimitStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Escalation: the provider tightens its limit further while no
  // mitigation is in place — worse than the original baseline.
  {
    id: "provider-tightened-escalation",
    when: { triggerEquals: { rateLimited: true, limitTightened: true } },
    incidentState: "escalating-violations",
    values: {
      rateLimitViolationRate: 72,
      effectiveThroughput: 60,
      retryQueueDepth: 780,
      throttleWindowRemainingMs: 60_000,
      rateLimitStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: rate-limit trigger active, no backoff, no
  // client-side limiting.
  {
    id: "rate-limit-critical-default",
    when: { triggerEquals: { rateLimited: true } },
    incidentState: "throttled",
    values: {
      rateLimitViolationRate: 42,
      effectiveThroughput: 180,
      retryQueueDepth: 410,
      throttleWindowRemainingMs: 30_000,
      rateLimitStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no rate-limit violation active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      rateLimitViolationRate: 0.2,
      effectiveThroughput: 480,
      retryQueueDepth: 5,
      throttleWindowRemainingMs: 0,
      rateLimitStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
