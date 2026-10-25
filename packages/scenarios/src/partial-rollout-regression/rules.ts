import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DEPENDENCY_PROTECTION_MODE_KEY,
  NEW_VERSION_INSTANCE_COUNT_KEY,
  REGRESSED_FEATURE_ENABLED_KEY,
  ROLLBACK_TO_OLD_VERSION_KEY,
  ROLLOUT_PERCENT_KEY,
  TRAFFIC_ROUTING_MODE_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  traffic: "healthy",
  "load-balancer": "healthy",
  "old-version": "healthy",
  "new-version": "healthy",
  "shared-dependency": "healthy",
};

const newVersionDegradedHealth: Record<string, ComponentHealth> = {
  traffic: "healthy",
  "load-balancer": "healthy",
  "old-version": "healthy",
  "new-version": "degraded",
  "shared-dependency": "healthy",
};

const newVersionCriticalHealth: Record<string, ComponentHealth> = {
  traffic: "healthy",
  "load-balancer": "healthy",
  "old-version": "healthy",
  "new-version": "critical",
  "shared-dependency": "degraded",
};

const bothCriticalHealth: Record<string, ComponentHealth> = {
  traffic: "healthy",
  "load-balancer": "degraded",
  "old-version": "critical",
  "new-version": "critical",
  "shared-dependency": "critical",
};

/**
 * Authored rule table for Partial Rollout Regression, ordered
 * most-specific-first.
 *
 * The newly deployed version has a regression isolated to one specific
 * feature: elevated error rate, latency, and memory usage, but ONLY for
 * requests routed to the new version. Four genuinely distinct containment
 * strategies exist:
 *
 *   1. Rollback (rollbackToOldVersion=true) — full revert. All traffic
 *      returns to the old version; the regressed code stops running for
 *      everyone, but every other improvement the new version shipped is
 *      discarded too, and reversing it again later requires a full
 *      redeploy-rollback cycle.
 *   2. Traffic isolation (rolloutPercent reduced, no rollback) — shrinks
 *      exposure proportionally. At rolloutPercent=0 this reaches the same
 *      zero-exposure outcome as rollback, faster and without discarding
 *      the deployed version (it can be raised again directly, no redeploy
 *      needed) — but any rolloutPercent > 0 still leaves some live users
 *      hitting the regression.
 *   3. Feature-flag disable (regressedFeatureEnabled=false) — disables
 *      the ONE regressed feature inside the new version while leaving the
 *      rest of the new version (and its other improvements) live at
 *      whatever rollout percentage it's already at. Comparably safe to
 *      rollback/full-isolation once this flag is off, and faster/cheaper
 *      than a full rollback since it needs no redeploy and preserves the
 *      new version's other changes for its current traffic share.
 *   4. Masking/scaling (newVersionInstanceCount raised, regression still
 *      active) — adds capacity to absorb the regression's elevated
 *      resource cost (memory) without touching the error/latency
 *      regression itself. Error rate and latency stay elevated for
 *      new-version traffic regardless of instance count.
 *
 * A secondary mechanism: if the regressed feature is left enabled at
 * meaningful rollout for long enough, its elevated retry/error volume
 * saturates the shared dependency's connection pool — a resource used by
 * BOTH versions — which begins degrading the previously-unaffected OLD
 * version's traffic too. dependencyProtectionMode ("circuit-breaker"
 * stronger, "rate-limit" weaker) reduces how much regressed-feature load
 * reaches the dependency; trafficRoutingMode="isolated-pool" instead
 * routes the new version's dependency calls through a separate pool so
 * the OLD version's traffic never shares the saturated resource even
 * once the second wave lands. None of these three protect the new
 * version's own error rate/latency — they contain the secondary
 * consequence, not the regression itself.
 */
export const partialRolloutRegressionRules: Rule[] = [
  // ── Strong recovery #1: full rollback. All traffic returns to the old
  // version; the regressed code runs for nobody. Wins over every other
  // control combination once active, since it is the most unconditional
  // containment available.
  {
    id: "rollback-recovery",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: { [ROLLBACK_TO_OLD_VERSION_KEY]: true },
    },
    incidentState: "rolled-back",
    values: {
      oldVersionErrorRate: 0.2,
      newVersionErrorRate: 0.2,
      oldVersionLatencyMs: 110,
      newVersionLatencyMs: 110,
      customerSuccessRate: 99.7,
      sharedDependencyPressure: 18,
      newVersionMemoryUsageMb: 410,
      rolloutState: "normal",
      regressionHealth: "regression-removed",
    },
    componentHealth: healthyHealth,
  },

  // ── Strong recovery #2 (alternate good path): the regressed feature
  // itself is disabled. The new version keeps serving its current
  // rollout share — none of its other improvements are discarded — but
  // the one regressed code path no longer executes, so error rate,
  // latency, and memory all recover to clean values regardless of
  // rolloutPercent/instance count/dependency protection settings. This is
  // the comparably-safe, faster, cheaper alternative to rollback that the
  // scenario is designed to validate as genuinely defensible.
  {
    id: "feature-flag-disable-recovery",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: { [REGRESSED_FEATURE_ENABLED_KEY]: false },
    },
    incidentState: "feature-disabled",
    values: {
      oldVersionErrorRate: 0.2,
      newVersionErrorRate: 0.25,
      oldVersionLatencyMs: 110,
      newVersionLatencyMs: 120,
      customerSuccessRate: 99.7,
      sharedDependencyPressure: 19,
      newVersionMemoryUsageMb: 415,
      rolloutState: "normal",
      regressionHealth: "regression-removed",
    },
    componentHealth: healthyHealth,
  },

  // ── Strong recovery #3 (equivalent to rollback in exposure, distinct
  // mechanism): rollout percentage driven to zero without ever flipping
  // the rollback toggle. The new version is still deployed — raising
  // rolloutPercent again needs no redeploy — but zero live traffic means
  // the regression affects nobody.
  {
    id: "rollout-zeroed-recovery",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: { [ROLLOUT_PERCENT_KEY]: 0 },
    },
    incidentState: "rollout-zeroed",
    values: {
      oldVersionErrorRate: 0.2,
      newVersionErrorRate: 0.3,
      oldVersionLatencyMs: 110,
      newVersionLatencyMs: 130,
      customerSuccessRate: 99.7,
      sharedDependencyPressure: 18,
      newVersionMemoryUsageMb: 420,
      rolloutState: "normal",
      regressionHealth: "regression-removed",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful: new-version instances scaled up while the regression (and
  // its feature) is still fully active at meaningful rollout. More
  // instances absorb some of the memory pressure per-instance, but every
  // instance still runs the SAME regressed code path, so error rate and
  // latency for new-version traffic stay just as bad — and the larger
  // fleet now issues even more concurrent calls into the shared
  // dependency, worsening dependency pressure rather than relieving
  // anything.
  {
    id: "scaled-new-version-worsens-dependency",
    when: {
      triggerEquals: { regressionActive: true },
      controlAtLeast: {
        [NEW_VERSION_INSTANCE_COUNT_KEY]: 16,
        [ROLLOUT_PERCENT_KEY]: 25,
      },
      controlEquals: { [REGRESSED_FEATURE_ENABLED_KEY]: true },
    },
    incidentState: "scaled-contention",
    values: {
      oldVersionErrorRate: 0.3,
      newVersionErrorRate: 9.8,
      oldVersionLatencyMs: 130,
      newVersionLatencyMs: 2_600,
      customerSuccessRate: 91.5,
      sharedDependencyPressure: 92,
      newVersionMemoryUsageMb: 640,
      rolloutState: "critical",
      regressionHealth: "unresolved",
    },
    componentHealth: newVersionCriticalHealth,
  },

  // ── Partial, acceptable-adjacent but not a fix: dependency protection
  // engaged (circuit breaker or rate limit) while the regressed feature
  // is still active. This shields the shared dependency — and therefore
  // the old version's otherwise-healthy traffic — from cross-
  // contamination, but new-version error rate/latency stay elevated for
  // whatever share of traffic it's still receiving. Genuinely useful
  // containment of the SECONDARY consequence, not of the regression
  // itself.
  {
    id: "dependency-protected-still-regressed",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: {
        [REGRESSED_FEATURE_ENABLED_KEY]: true,
        [DEPENDENCY_PROTECTION_MODE_KEY]: "circuit-breaker",
      },
    },
    incidentState: "dependency-protected",
    values: {
      oldVersionErrorRate: 0.3,
      newVersionErrorRate: 6.2,
      oldVersionLatencyMs: 115,
      newVersionLatencyMs: 1_450,
      customerSuccessRate: 95.8,
      sharedDependencyPressure: 34,
      newVersionMemoryUsageMb: 470,
      rolloutState: "warning",
      regressionHealth: "masked",
    },
    componentHealth: newVersionDegradedHealth,
  },

  // ── Partial, acceptable-adjacent but not a fix (lighter-touch
  // variant): rate limiting the shared dependency instead of a full
  // circuit breaker. Reduces dependency pressure somewhat (bounds the
  // volume of calls let through) but, unlike the circuit breaker, still
  // lets a meaningful share of regressed-feature calls reach the
  // dependency, so protection is weaker and new-version error rate stays
  // higher than the circuit-breaker path.
  {
    id: "dependency-rate-limited-still-regressed",
    when: {
      triggerEquals: { regressionActive: true },
      controlEquals: {
        [REGRESSED_FEATURE_ENABLED_KEY]: true,
        [DEPENDENCY_PROTECTION_MODE_KEY]: "rate-limit",
      },
    },
    incidentState: "dependency-rate-limited",
    values: {
      oldVersionErrorRate: 0.4,
      newVersionErrorRate: 7.5,
      oldVersionLatencyMs: 140,
      newVersionLatencyMs: 1_900,
      customerSuccessRate: 93.4,
      sharedDependencyPressure: 56,
      newVersionMemoryUsageMb: 540,
      rolloutState: "warning",
      regressionHealth: "masked",
    },
    componentHealth: newVersionDegradedHealth,
  },

  // ── Second wave, isolated pool: the regression continues and the
  // shared dependency's pool saturates, but trafficRoutingMode was
  // already set to "isolated-pool" — the new version's calls run
  // through a separate pool from the old version's, so the OLD version's
  // traffic never shares the saturated resource. The new version itself
  // is still regressed (this is containment of the secondary
  // consequence, not a fix).
  {
    id: "dependency-saturated-isolated-pool-contains-old-version",
    when: {
      triggerEquals: { regressionActive: true, dependencySaturating: true },
      controlEquals: {
        [TRAFFIC_ROUTING_MODE_KEY]: "isolated-pool",
        [REGRESSED_FEATURE_ENABLED_KEY]: true,
      },
    },
    incidentState: "isolated-pool-contained",
    values: {
      oldVersionErrorRate: 0.3,
      newVersionErrorRate: 11.2,
      oldVersionLatencyMs: 125,
      newVersionLatencyMs: 2_900,
      customerSuccessRate: 94.6,
      sharedDependencyPressure: 90,
      newVersionMemoryUsageMb: 700,
      rolloutState: "critical",
      regressionHealth: "unresolved",
    },
    componentHealth: newVersionCriticalHealth,
  },

  // ── Second wave, baseline: sustained unmitigated regression finally
  // saturates the shared dependency, and the previously-unaffected OLD
  // version begins degrading too (cross-contamination through the shared
  // resource).
  {
    id: "dependency-saturated-cross-contamination",
    when: { triggerEquals: { regressionActive: true, dependencySaturating: true } },
    incidentState: "cross-contaminated",
    values: {
      oldVersionErrorRate: 14.5,
      newVersionErrorRate: 22.0,
      oldVersionLatencyMs: 2_400,
      newVersionLatencyMs: 2_900,
      customerSuccessRate: 76.0,
      sharedDependencyPressure: 99,
      newVersionMemoryUsageMb: 700,
      rolloutState: "critical",
      regressionHealth: "unresolved",
    },
    componentHealth: bothCriticalHealth,
  },

  // ── Baseline critical: regression active, no meaningful mitigation
  // taken yet. Only the new version is affected; the old version is
  // still clean.
  {
    id: "regression-baseline",
    when: { triggerEquals: { regressionActive: true } },
    incidentState: "regressing",
    values: {
      oldVersionErrorRate: 0.3,
      newVersionErrorRate: 8.4,
      oldVersionLatencyMs: 120,
      newVersionLatencyMs: 2_100,
      customerSuccessRate: 94.1,
      sharedDependencyPressure: 48,
      newVersionMemoryUsageMb: 580,
      rolloutState: "critical",
      regressionHealth: "unresolved",
    },
    componentHealth: newVersionCriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      oldVersionErrorRate: 0.2,
      newVersionErrorRate: 0.3,
      oldVersionLatencyMs: 110,
      newVersionLatencyMs: 130,
      customerSuccessRate: 99.7,
      sharedDependencyPressure: 20,
      newVersionMemoryUsageMb: 420,
      rolloutState: "normal",
      regressionHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
