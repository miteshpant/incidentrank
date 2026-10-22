import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_TIMEOUT_MS_KEY,
  ASYNC_PROCESSING_ENABLED_KEY,
  CACHED_RESPONSE_FALLBACK_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "checkout-service": "healthy",
  "integration-adapter": "healthy",
  "response-cache": "healthy",
  "shipping-rate-api": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "checkout-service": "degraded",
  "integration-adapter": "degraded",
  "response-cache": "healthy",
  "shipping-rate-api": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "checkout-service": "critical",
  "integration-adapter": "critical",
  "response-cache": "healthy",
  "shipping-rate-api": "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "checkout-service": "healthy",
  "integration-adapter": "healthy",
  "response-cache": "healthy",
  "shipping-rate-api": "degraded",
};

/**
 * Authored rule table for Third-Party API Latency, ordered
 * most-specific-first. The vendor itself cannot be fixed — every rule
 * models the consequence of how YOUR system responds to its slowness.
 * Encodes a harmful trap (lengthening the timeout "to give the vendor
 * more time" ties up checkout-service capacity even longer per request),
 * a strongest-recovery path (short timeout + cached fallback + async
 * processing), a clean recovery path (the default (already-short) timeout
 * + cached fallback enabled), a partial path (timeout shortened further
 * but fallback never enabled — fails fast instead of blocking, but every
 * failure surfaces as a hard checkout error instead of a good-enough
 * cached rate, so abandonment stays elevated), a baseline-critical
 * default, and a healthy fallback.
 */
export const vendorLatencyRules: Rule[] = [
  // ── Harmful: lengthening the timeout while the vendor is slow — you
  // cannot make the vendor respond faster by waiting longer, so this
  // only ties up more checkout-service thread-pool capacity per request.
  {
    id: "lengthened-timeout-harmful",
    when: {
      triggerEquals: { vendorSlow: true },
      controlAtLeast: { [API_TIMEOUT_MS_KEY]: 8_000 },
      controlEquals: { [CACHED_RESPONSE_FALLBACK_ENABLED_KEY]: false },
    },
    incidentState: "capacity-exhausted",
    values: {
      checkoutServiceThreadPoolUtilization: 96,
      thirdPartyResponseTimeMs: 7_800,
      checkoutAbandonmentRate: 38,
      cacheFallbackHitRate: 0,
      checkoutStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Strongest recovery: short timeout, cached fallback, AND async
  // processing — checkout never blocks on the vendor at all.
  {
    id: "full-mitigation-recovery",
    when: {
      triggerEquals: { vendorSlow: true },
      controlAtMost: { [API_TIMEOUT_MS_KEY]: 2_000 },
      controlEquals: {
        [CACHED_RESPONSE_FALLBACK_ENABLED_KEY]: true,
        [ASYNC_PROCESSING_ENABLED_KEY]: true,
      },
    },
    incidentState: "recovering",
    values: {
      checkoutServiceThreadPoolUtilization: 18,
      thirdPartyResponseTimeMs: 180,
      checkoutAbandonmentRate: 2,
      cacheFallbackHitRate: 90,
      checkoutStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Good recovery: short timeout + cached fallback — fails fast and
  // serves a good-enough cached rate instead of blocking checkout.
  {
    id: "timeout-and-fallback-recovery",
    when: {
      triggerEquals: { vendorSlow: true },
      controlAtMost: { [API_TIMEOUT_MS_KEY]: 2_000 },
      controlEquals: { [CACHED_RESPONSE_FALLBACK_ENABLED_KEY]: true },
    },
    incidentState: "recovering",
    values: {
      checkoutServiceThreadPoolUtilization: 28,
      thirdPartyResponseTimeMs: 180,
      checkoutAbandonmentRate: 5,
      cacheFallbackHitRate: 85,
      checkoutStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial improvement: timeout shortened, but cached fallback never
  // enabled — checkout now fails fast instead of blocking, but every
  // failed request surfaces as a hard error to the customer instead of a
  // good-enough cached rate, so abandonment stays elevated even though
  // thread-pool pressure eases.
  {
    id: "short-timeout-without-fallback",
    when: {
      triggerEquals: { vendorSlow: true },
      controlAtMost: { [API_TIMEOUT_MS_KEY]: 500 },
    },
    incidentState: "degraded",
    values: {
      checkoutServiceThreadPoolUtilization: 55,
      thirdPartyResponseTimeMs: 500,
      checkoutAbandonmentRate: 22,
      cacheFallbackHitRate: 0,
      checkoutStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: vendor slow, no mitigation.
  {
    id: "vendor-slow-default",
    when: { triggerEquals: { vendorSlow: true } },
    incidentState: "degraded-checkout",
    values: {
      checkoutServiceThreadPoolUtilization: 85,
      thirdPartyResponseTimeMs: 6_500,
      checkoutAbandonmentRate: 30,
      cacheFallbackHitRate: 0,
      checkoutStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: vendor responding normally.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      checkoutServiceThreadPoolUtilization: 20,
      thirdPartyResponseTimeMs: 180,
      checkoutAbandonmentRate: 2,
      cacheFallbackHitRate: 0,
      checkoutStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
