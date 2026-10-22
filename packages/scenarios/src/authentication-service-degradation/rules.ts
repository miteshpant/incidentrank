import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AUTH_SERVICE_INSTANCES_KEY,
  SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY,
  TOKEN_CACHE_TTL_SECONDS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "auth-service": "healthy",
  "token-cache": "healthy",
  "identity-database": "healthy",
  "protected-service": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "api-gateway": "degraded",
  "auth-service": "degraded",
  "token-cache": "healthy",
  "identity-database": "degraded",
  "protected-service": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "api-gateway": "critical",
  "auth-service": "critical",
  "token-cache": "degraded",
  "identity-database": "critical",
  "protected-service": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "api-gateway": "healthy",
  "auth-service": "healthy",
  "token-cache": "healthy",
  "identity-database": "healthy",
  "protected-service": "healthy",
};

/**
 * Authored rule table for Authentication Service Degradation, ordered
 * most-specific-first. Encodes a security-regression trap (bypassing
 * signature verification entirely — metrics APPEAR to recover since
 * verification work is skipped, but the incidentState is explicitly
 * "security-compromised", never "recovering"/"resolved", distinguishing
 * this from every other scenario's harmful path, where a bad choice
 * makes metrics look worse, not better), a clean capacity-based recovery
 * path, two partial paths (scaling alone, cache-TTL extension alone),
 * an escalation once cache hit rate degrades further, a baseline-critical
 * default, and a healthy fallback.
 */
export const authDegradationRules: Rule[] = [
  // ── Security regression trap: skipping signature verification makes
  // latency/failure-rate metrics look dramatically BETTER (verification
  // work is simply never done), which is exactly what makes this choice
  // tempting under pressure. incidentState is "security-compromised" —
  // deliberately never "recovering" or "resolved" — because the system
  // is now accepting unverified tokens, not actually healthy.
  {
    id: "signature-bypass-security-regression",
    when: {
      triggerEquals: { authDegraded: true },
      controlEquals: { [SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY]: true },
    },
    incidentState: "security-compromised",
    values: {
      authServiceLatencyMs: 20,
      authFailureRate: 0.05,
      tokenValidationThroughput: 6_500,
      activeSessionCount: 520,
      authServiceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: enough auth service capacity, a moderate cache TTL,
  // verification never bypassed.
  {
    id: "scaled-instances-recovery",
    when: {
      triggerEquals: { authDegraded: true },
      controlAtLeast: { [AUTH_SERVICE_INSTANCES_KEY]: 8 },
      controlEquals: { [SIGNATURE_VERIFICATION_BYPASS_ENABLED_KEY]: false },
    },
    incidentState: "recovering",
    values: {
      authServiceLatencyMs: 45,
      authFailureRate: 0.2,
      tokenValidationThroughput: 3_900,
      activeSessionCount: 500,
      authServiceStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Partial improvement: moderate scaling, not yet enough to fully
  // absorb the load. Distinct incidentState from the cache-TTL partial
  // below so revenueLossRatePerMinute (keyed by incidentState) actually
  // differentiates these two different partial mitigations instead of
  // tying.
  {
    id: "partially-scaled",
    when: {
      triggerEquals: { authDegraded: true },
      controlAtLeast: { [AUTH_SERVICE_INSTANCES_KEY]: 4 },
    },
    incidentState: "degraded-partial-scale",
    values: {
      authServiceLatencyMs: 850,
      authFailureRate: 4,
      tokenValidationThroughput: 1_600,
      activeSessionCount: 480,
      authServiceStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Smaller partial improvement: cache TTL extended to relieve
  // re-validation load, instances not scaled — real but incomplete
  // relief, and it doesn't address the root capacity issue.
  {
    id: "cache-ttl-extended-only",
    when: {
      triggerEquals: { authDegraded: true },
      controlAtLeast: { [TOKEN_CACHE_TTL_SECONDS_KEY]: 300 },
    },
    incidentState: "degraded-cache-ttl",
    values: {
      authServiceLatencyMs: 1_400,
      authFailureRate: 6,
      tokenValidationThroughput: 1_200,
      activeSessionCount: 490,
      authServiceStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Escalation: degraded cache hit rate compounds load while no
  // mitigation is in place.
  {
    id: "cache-degradation-escalation",
    when: { triggerEquals: { authDegraded: true, cacheHitRateDegraded: true } },
    incidentState: "severe-degradation",
    values: {
      authServiceLatencyMs: 5_200,
      authFailureRate: 28,
      tokenValidationThroughput: 300,
      activeSessionCount: 460,
      authServiceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: degradation trigger active, no mitigation.
  {
    id: "degradation-critical-default",
    when: { triggerEquals: { authDegraded: true } },
    incidentState: "degrading",
    values: {
      authServiceLatencyMs: 3_800,
      authFailureRate: 18,
      tokenValidationThroughput: 600,
      activeSessionCount: 470,
      authServiceStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no degradation active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      authServiceLatencyMs: 40,
      authFailureRate: 0.1,
      tokenValidationThroughput: 4_000,
      activeSessionCount: 500,
      authServiceStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
