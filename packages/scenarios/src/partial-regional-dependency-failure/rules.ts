import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  APAC_ROUTING_MODE_KEY,
  DEPENDENCY_FALLBACK_ENABLED_KEY,
  EU_ROUTING_MODE_KEY,
  GLOBAL_CIRCUIT_BREAKER_KEY,
  TIMEOUT_POLICY_MS_KEY,
  US_ROUTING_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "global-api": "healthy",
  "us-regional-service": "healthy",
  "eu-regional-service": "healthy",
  "apac-regional-service": "healthy",
  "shared-dependency": "healthy",
};

// US healthy, EU degraded (slow), APAC critical (intermittently failing).
const divergedBaselineHealth: Record<string, ComponentHealth> = {
  "global-api": "degraded",
  "us-regional-service": "healthy",
  "eu-regional-service": "degraded",
  "apac-regional-service": "critical",
  "shared-dependency": "degraded",
};

// Region-scoped recovery: EU and APAC isolated onto fallback (both
// recovered to a stable degraded-but-available state), US untouched.
const regionalRecoveryHealth: Record<string, ComponentHealth> = {
  "global-api": "healthy",
  "us-regional-service": "healthy",
  "eu-regional-service": "degraded",
  "apac-regional-service": "degraded",
  "shared-dependency": "degraded",
};

// Global circuit breaker: every region, including the healthy one,
// forced onto fallback uniformly.
const globalBreakerHealth: Record<string, ComponentHealth> = {
  "global-api": "degraded",
  "us-regional-service": "degraded",
  "eu-regional-service": "degraded",
  "apac-regional-service": "degraded",
  "shared-dependency": "degraded",
};

// APAC isolated/fixed, EU and US both left on live calls -> EU still slow.
const apacOnlyFixedHealth: Record<string, ComponentHealth> = {
  "global-api": "degraded",
  "us-regional-service": "healthy",
  "eu-regional-service": "degraded",
  "apac-regional-service": "degraded",
  "shared-dependency": "degraded",
};

// EU isolated/fixed, APAC still failing untouched.
const euOnlyFixedHealth: Record<string, ComponentHealth> = {
  "global-api": "degraded",
  "us-regional-service": "healthy",
  "eu-regional-service": "degraded",
  "apac-regional-service": "critical",
  "shared-dependency": "degraded",
};

const apacWorsenedHealth: Record<string, ComponentHealth> = {
  "global-api": "critical",
  "us-regional-service": "healthy",
  "eu-regional-service": "degraded",
  "apac-regional-service": "critical",
  "shared-dependency": "critical",
};

/**
 * Authored rule table for Partial Regional Dependency Failure, ordered
 * most-specific first. The shared dependency is healthy for US calls,
 * slow for EU calls, and intermittently failing for APAC calls — all
 * three, simultaneously, for the whole incident. The scenario's binding
 * design requirement: a globally uniform mitigation (the global circuit
 * breaker) genuinely relieves EU and APAC but ALSO forces US — which was
 * never broken — onto the degraded fallback path, measurably lowering
 * US's own success rate and the global blended success rate below what a
 * region-scoped fix achieves. Isolating only the regions that are
 * actually unhealthy (EU + APAC) preserves US's full live service and
 * yields a strictly better blended outcome.
 */
export const partialRegionalDependencyFailureRules: Rule[] = [
  // ── Optimal: region-scoped mitigation. EU and APAC isolated onto the
  // fallback path (with fallback enabled so isolation has somewhere safe
  // to land); US left on normal routing because US was never unhealthy.
  // Every region stabilizes, and US's success rate stays at its
  // pre-incident level the whole time — the healthy region paid no cost
  // at all. Checked first so it wins over every other combination once
  // applied.
  {
    id: "regional-scoped-recovery",
    when: {
      triggerEquals: { regionalDivergence: true },
      controlEquals: {
        [US_ROUTING_MODE_KEY]: "normal",
        [EU_ROUTING_MODE_KEY]: "isolate",
        [APAC_ROUTING_MODE_KEY]: "isolate",
        [DEPENDENCY_FALLBACK_ENABLED_KEY]: true,
        [GLOBAL_CIRCUIT_BREAKER_KEY]: false,
      },
    },
    incidentState: "regional-scoped-recovery",
    values: {
      usSuccessRate: 99.8,
      euSuccessRate: 97.0,
      apacSuccessRate: 97.0,
      usLatencyMs: 80,
      euLatencyMs: 120,
      apacLatencyMs: 100,
      usDependencyHealth: "normal",
      euDependencyHealth: "warning",
      apacDependencyHealth: "warning",
      fallbackTrafficPercent: 62,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 98.0,
      mitigationApproach: "regional",
    },
    componentHealth: regionalRecoveryHealth,
  },

  // ── Trap (the scenario's central correctness-of-judgment case):
  // global circuit breaker tripped. This DOES relieve EU and APAC (both
  // stop placing live calls to the degraded dependency), but it applies
  // uniformly — US is forced onto the identical fallback path even
  // though US's live calls were succeeding at 99.8%. US's own success
  // rate and the global blended rate both land measurably below the
  // region-scoped path's numbers above, proving the uniform mitigation
  // is not automatically optimal. Scored as acceptable: the system is
  // safe (nothing is actively failing), but a healthy region was
  // needlessly sacrificed.
  {
    id: "global-breaker-uniform-tradeoff",
    when: {
      triggerEquals: { regionalDivergence: true },
      controlEquals: {
        [GLOBAL_CIRCUIT_BREAKER_KEY]: true,
        [DEPENDENCY_FALLBACK_ENABLED_KEY]: true,
      },
    },
    incidentState: "global-breaker-tripped",
    values: {
      usSuccessRate: 96.5,
      euSuccessRate: 97.0,
      apacSuccessRate: 97.0,
      usLatencyMs: 130,
      euLatencyMs: 125,
      apacLatencyMs: 105,
      usDependencyHealth: "warning",
      euDependencyHealth: "warning",
      apacDependencyHealth: "warning",
      fallbackTrafficPercent: 100,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 96.8,
      mitigationApproach: "global",
    },
    componentHealth: globalBreakerHealth,
  },

  // ── Trap variant: global circuit breaker tripped WITHOUT fallback
  // enabled. Every region, including US, now has nowhere to land —
  // dependency calls are simply refused everywhere. This is strictly
  // worse than tripping the breaker with fallback on, and far worse than
  // the region-scoped path, because the one genuinely healthy region
  // loses service outright rather than degrading gracefully.
  {
    id: "global-breaker-no-fallback-outage",
    when: {
      triggerEquals: { regionalDivergence: true },
      controlEquals: {
        [GLOBAL_CIRCUIT_BREAKER_KEY]: true,
        [DEPENDENCY_FALLBACK_ENABLED_KEY]: false,
      },
    },
    incidentState: "global-breaker-no-fallback",
    values: {
      usSuccessRate: 40.0,
      euSuccessRate: 40.0,
      apacSuccessRate: 40.0,
      usLatencyMs: 50,
      euLatencyMs: 50,
      apacLatencyMs: 50,
      usDependencyHealth: "critical",
      euDependencyHealth: "critical",
      apacDependencyHealth: "critical",
      fallbackTrafficPercent: 0,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 40.0,
      mitigationApproach: "global",
    },
    componentHealth: globalBreakerHealth,
  },

  // ── Partial: only APAC isolated (with fallback). APAC's intermittent
  // failures are relieved, but EU's slowness is left completely
  // untouched — EU's latency and success rate stay at unmitigated
  // levels. Genuine partial relief, not a complete mitigation.
  {
    id: "apac-only-isolated-eu-still-slow",
    when: {
      triggerEquals: { regionalDivergence: true },
      controlEquals: {
        [US_ROUTING_MODE_KEY]: "normal",
        [EU_ROUTING_MODE_KEY]: "normal",
        [APAC_ROUTING_MODE_KEY]: "isolate",
        [DEPENDENCY_FALLBACK_ENABLED_KEY]: true,
      },
    },
    incidentState: "apac-only-fixed",
    values: {
      usSuccessRate: 99.8,
      euSuccessRate: 84.0,
      apacSuccessRate: 97.0,
      usLatencyMs: 80,
      euLatencyMs: 3_800,
      apacLatencyMs: 100,
      usDependencyHealth: "normal",
      euDependencyHealth: "warning",
      apacDependencyHealth: "warning",
      fallbackTrafficPercent: 33,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 93.6,
      mitigationApproach: "none",
    },
    componentHealth: apacOnlyFixedHealth,
  },

  // ── Partial: only EU isolated (with fallback). EU's slow calls are
  // relieved, but APAC's intermittent failures are left untouched and
  // will worsen on the second wave if the candidate stops here.
  {
    id: "eu-only-isolated-apac-still-failing",
    when: {
      triggerEquals: { regionalDivergence: true },
      controlEquals: {
        [US_ROUTING_MODE_KEY]: "normal",
        [EU_ROUTING_MODE_KEY]: "isolate",
        [APAC_ROUTING_MODE_KEY]: "normal",
        [DEPENDENCY_FALLBACK_ENABLED_KEY]: true,
      },
    },
    incidentState: "eu-only-fixed",
    values: {
      usSuccessRate: 99.8,
      euSuccessRate: 97.0,
      apacSuccessRate: 70.0,
      usLatencyMs: 80,
      euLatencyMs: 120,
      apacLatencyMs: 95,
      usDependencyHealth: "normal",
      euDependencyHealth: "warning",
      apacDependencyHealth: "critical",
      fallbackTrafficPercent: 33,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 88.9,
      mitigationApproach: "none",
    },
    componentHealth: euOnlyFixedHealth,
  },

  // ── Trap: tightening the global timeout policy alone. A tight budget
  // caps how long EU's slow calls can hang (real, partial relief for
  // EU's latency), but it does nothing for APAC's problem (intermittent
  // outright failures, not slowness — a shorter timeout does not stop a
  // call from failing) and it applies to US too, clipping some of US's
  // normal-but-not-instant calls that would otherwise have succeeded.
  {
    id: "tight-timeout-clips-healthy-us-without-fixing-apac",
    when: {
      triggerEquals: { regionalDivergence: true },
      controlAtMost: { [TIMEOUT_POLICY_MS_KEY]: 600 },
      controlEquals: {
        [US_ROUTING_MODE_KEY]: "normal",
        [EU_ROUTING_MODE_KEY]: "normal",
        [APAC_ROUTING_MODE_KEY]: "normal",
        [GLOBAL_CIRCUIT_BREAKER_KEY]: false,
      },
    },
    incidentState: "tight-timeout-tradeoff",
    values: {
      usSuccessRate: 94.0,
      euSuccessRate: 90.0,
      apacSuccessRate: 71.0,
      usLatencyMs: 80,
      euLatencyMs: 600,
      apacLatencyMs: 95,
      usDependencyHealth: "warning",
      euDependencyHealth: "warning",
      apacDependencyHealth: "critical",
      fallbackTrafficPercent: 0,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 83.5,
      mitigationApproach: "none",
    },
    componentHealth: divergedBaselineHealth,
  },

  // ── Second wave, baseline: APAC's intermittent failures have grown
  // into sustained majority failures. Only reachable once no mitigation
  // above has matched.
  {
    id: "apac-worsened-second-wave",
    when: { triggerEquals: { regionalDivergence: true, apacWorsening: true } },
    incidentState: "apac-worsened",
    values: {
      usSuccessRate: 99.8,
      euSuccessRate: 85.0,
      apacSuccessRate: 38.0,
      usLatencyMs: 80,
      euLatencyMs: 3_800,
      apacLatencyMs: 95,
      usDependencyHealth: "normal",
      euDependencyHealth: "warning",
      apacDependencyHealth: "critical",
      fallbackTrafficPercent: 0,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 74.3,
      mitigationApproach: "none",
    },
    componentHealth: apacWorsenedHealth,
  },

  // ── Baseline critical: the dependency has diverged by region and the
  // candidate has taken no meaningfully mitigating action yet.
  {
    id: "regional-divergence-baseline",
    when: { triggerEquals: { regionalDivergence: true } },
    incidentState: "regional-divergence",
    values: {
      usSuccessRate: 99.8,
      euSuccessRate: 85.0,
      apacSuccessRate: 70.0,
      usLatencyMs: 80,
      euLatencyMs: 3_800,
      apacLatencyMs: 95,
      usDependencyHealth: "normal",
      euDependencyHealth: "warning",
      apacDependencyHealth: "critical",
      fallbackTrafficPercent: 0,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 85.0,
      mitigationApproach: "none",
    },
    componentHealth: divergedBaselineHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      usSuccessRate: 99.8,
      euSuccessRate: 99.5,
      apacSuccessRate: 99.6,
      usLatencyMs: 80,
      euLatencyMs: 110,
      apacLatencyMs: 90,
      usDependencyHealth: "normal",
      euDependencyHealth: "normal",
      apacDependencyHealth: "normal",
      fallbackTrafficPercent: 0,
      crossRegionRequestVolumePerMinute: 24_000,
      globalCustomerSuccessRate: 99.6,
      mitigationApproach: "none",
    },
    componentHealth: healthyHealth,
  },
];
