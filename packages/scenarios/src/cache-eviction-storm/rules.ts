import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_CONCURRENCY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  DB_PROTECTION_KEY,
  OBJECT_CACHING_POLICY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  cache: "healthy",
  database: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  api: "degraded",
  cache: "degraded",
  database: "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  api: "degraded",
  cache: "critical",
  database: "critical",
};

const apiHealthyDbCriticalHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  cache: "critical",
  database: "critical",
};

/**
 * Authored rule table for Cache Eviction Storm, ordered most-specific
 * first. A deployment changed the cached object shape (payloads got much
 * bigger) and cardinality (far more distinct keys). Keys are now evicted
 * before they are reused: eviction rate climbs, hit ratio collapses, and
 * database read load rises to fill the gap.
 *
 * The scenario's required distinction, modeled with real distinct
 * values:
 *
 *   - A PURE CAPACITY response (raise cacheMemoryMultiplier alone,
 *     policy/admission untouched) gives genuine, partial, incomplete
 *     relief — more memory means fewer evictions per second, but because
 *     every entry is still the new, much larger full-object shape and
 *     the new, much larger key cardinality is still being admitted
 *     wholesale, eviction churn keeps climbing again as the larger
 *     working set itself grows into the larger memory ceiling. It never
 *     fully stabilizes; it only buys time at a larger scale.
 *   - A POLICY response (projectedFields caching and/or size-aware
 *     admission) fully resolves eviction churn even with NO added memory
 *     — because it addresses what changed (object size / cardinality)
 *     rather than how much room there is for it.
 *   - Combining both is the clean optimal path.
 *
 * Two harmful/incomplete traps exist:
 *   - Scaling API concurrency does nothing for the cache; more concurrent
 *     requests just produce more concurrent misses against an unchanged
 *     hit ratio, pushing MORE read load onto the database.
 *   - Lowering the TTL alone makes eviction churn worse, not better — it
 *     proactively expires entries sooner, on top of the memory-pressure
 *     evictions already happening, shrinking effective cache lifetime
 *     further.
 */
export const cacheEvictionStormRules: Rule[] = [
  // ── Optimal recovery: a real policy fix (projected-field caching
  // and/or size-aware admission) is in place. Eviction churn fully
  // resolves because the cache's per-entry footprint and admitted key
  // set now match the new object shape/cardinality — regardless of how
  // much memory is provisioned. Checked first so it wins over every
  // memory-multiplier value once a policy fix is applied.
  {
    id: "policy-fix-full-recovery",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlEquals: { [OBJECT_CACHING_POLICY_KEY]: "projectedFields", [CACHE_ADMISSION_POLICY_KEY]: "sizeAwareAdmission" },
    },
    incidentState: "policy-fixed-recovered",
    values: {
      evictionRatePerSec: 8,
      hitRatioPct: 96,
      memoryUtilizationPct: 40,
      dbReadsPerSec: 150,
      cacheLatencyMs: 3,
      apiLatencyMs: 55,
      cacheStatus: "normal",
      cacheRecoveryMode: "policyFixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery, alternate single-lever form: size-aware
  // admission alone (object caching policy left at fullObject). Rejecting
  // the long tail of now-much-more-numerous distinct keys up front
  // protects the hot working set even though each admitted entry is
  // still the larger full-object shape — this is enough to fully resolve
  // eviction churn on its own.
  {
    id: "admission-policy-alone-full-recovery",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlEquals: { [CACHE_ADMISSION_POLICY_KEY]: "sizeAwareAdmission" },
    },
    incidentState: "admission-fixed-recovered",
    values: {
      evictionRatePerSec: 10,
      hitRatioPct: 95,
      memoryUtilizationPct: 45,
      dbReadsPerSec: 160,
      cacheLatencyMs: 3,
      apiLatencyMs: 56,
      cacheStatus: "normal",
      cacheRecoveryMode: "policyFixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Optimal recovery, alternate single-lever form: projected-field
  // caching alone (admission policy left at admitAll). Shrinking each
  // entry's footprint back down to only the fields the read path needs
  // is, by itself, enough that the new cardinality fits without churn.
  {
    id: "object-policy-alone-full-recovery",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlEquals: { [OBJECT_CACHING_POLICY_KEY]: "projectedFields" },
    },
    incidentState: "object-policy-fixed-recovered",
    values: {
      evictionRatePerSec: 11,
      hitRatioPct: 95,
      memoryUtilizationPct: 46,
      dbReadsPerSec: 162,
      cacheLatencyMs: 3,
      apiLatencyMs: 56,
      cacheStatus: "normal",
      cacheRecoveryMode: "policyFixed",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful: API concurrency scaled up while churn is rising and no
  // policy/memory change has happened. More concurrent requests simply
  // produce more concurrent cache misses against the same collapsed hit
  // ratio, pushing MORE read volume onto an already-struggling database.
  {
    id: "scaled-concurrency-worsens-db-pressure",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlEquals: { [API_CONCURRENCY_KEY]: "high", [CACHE_MEMORY_MULTIPLIER_KEY]: 1, [OBJECT_CACHING_POLICY_KEY]: "fullObject", [CACHE_ADMISSION_POLICY_KEY]: "admitAll" },
    },
    incidentState: "scaled-concurrency-worsened",
    values: {
      evictionRatePerSec: 410,
      hitRatioPct: 22,
      memoryUtilizationPct: 99,
      dbReadsPerSec: 5_200,
      cacheLatencyMs: 48,
      apiLatencyMs: 1_900,
      cacheStatus: "critical",
      cacheRecoveryMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Harmful: TTL lowered alone while churn is rising. Proactively
  // expiring entries sooner compounds the memory-pressure evictions
  // already happening — eviction rate gets WORSE than the unmitigated
  // baseline, not better.
  {
    id: "lower-ttl-worsens-churn",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlAtMost: { [CACHE_TTL_KEY]: 300 },
      controlEquals: { [OBJECT_CACHING_POLICY_KEY]: "fullObject", [CACHE_ADMISSION_POLICY_KEY]: "admitAll" },
    },
    incidentState: "ttl-lowered-worsened",
    values: {
      evictionRatePerSec: 340,
      hitRatioPct: 28,
      memoryUtilizationPct: 96,
      dbReadsPerSec: 2_800,
      cacheLatencyMs: 32,
      apiLatencyMs: 1_200,
      cacheStatus: "critical",
      cacheRecoveryMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Partial relief, capacity-only: memory multiplier raised to the
  // maximum, policy/admission untouched. Genuinely reduces eviction
  // pressure (more room before anything has to be evicted) and database
  // read load drops accordingly — but every admitted entry is still the
  // new, much larger full-object shape at the new, much larger
  // cardinality, so the larger working set is still growing into the
  // larger ceiling. This is the delayed-churn-return state: temporary,
  // incomplete relief, not a stable fix. Matches the second-wave DB
  // pressure trigger too, since more memory alone does not prevent it
  // from eventually recurring.
  {
    id: "memory-scaled-partial-relief",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlAtLeast: { [CACHE_MEMORY_MULTIPLIER_KEY]: 8 },
      controlEquals: { [OBJECT_CACHING_POLICY_KEY]: "fullObject", [CACHE_ADMISSION_POLICY_KEY]: "admitAll" },
    },
    incidentState: "memory-scaled-partial",
    values: {
      evictionRatePerSec: 95,
      hitRatioPct: 68,
      memoryUtilizationPct: 82,
      dbReadsPerSec: 820,
      cacheLatencyMs: 9,
      apiLatencyMs: 240,
      cacheStatus: "warning",
      cacheRecoveryMode: "memoryScaled",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial relief, capacity-only, smaller increment: memory
  // multiplier raised to 4 (not maxed), policy/admission untouched. Less
  // complete relief than the 8x case above — still clearly incomplete.
  {
    id: "memory-scaled-moderate-partial-relief",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlAtLeast: { [CACHE_MEMORY_MULTIPLIER_KEY]: 4 },
      controlEquals: { [OBJECT_CACHING_POLICY_KEY]: "fullObject", [CACHE_ADMISSION_POLICY_KEY]: "admitAll" },
    },
    incidentState: "memory-scaled-moderate-partial",
    values: {
      evictionRatePerSec: 160,
      hitRatioPct: 55,
      memoryUtilizationPct: 88,
      dbReadsPerSec: 1_450,
      cacheLatencyMs: 14,
      apiLatencyMs: 420,
      cacheStatus: "warning",
      cacheRecoveryMode: "memoryScaled",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial relief: DB request protection enabled (rate limiting or
  // coalescing) without fixing the cache side at all. This shields the
  // database from the worst of the read spike — dbReadsPerSec and
  // apiLatencyMs improve meaningfully — but it is pure downstream
  // protection: the cache itself is still thrashing (eviction rate and
  // hit ratio are unchanged from baseline), so the cache layer's own
  // caching capability has not been restored.
  {
    id: "db-protection-only-shields-database",
    when: {
      triggerEquals: { evictionChurnRising: true },
      controlEquals: {
        [DB_PROTECTION_KEY]: "coalescing",
        [CACHE_MEMORY_MULTIPLIER_KEY]: 1,
        [OBJECT_CACHING_POLICY_KEY]: "fullObject",
        [CACHE_ADMISSION_POLICY_KEY]: "admitAll",
      },
    },
    incidentState: "db-shielded-cache-still-thrashing",
    values: {
      evictionRatePerSec: 260,
      hitRatioPct: 31,
      memoryUtilizationPct: 97,
      dbReadsPerSec: 700,
      cacheLatencyMs: 22,
      apiLatencyMs: 380,
      cacheStatus: "warning",
      cacheRecoveryMode: "unresolved",
    },
    componentHealth: degradedHealth,
  },

  // ── Second wave, baseline: sustained unmitigated eviction churn
  // finally drives database read latency itself into critical territory.
  // Only reachable once no mitigation above has matched.
  {
    id: "db-read-pressure-baseline",
    when: { triggerEquals: { evictionChurnRising: true, dbReadPressureBuilding: true } },
    incidentState: "db-read-pressure-critical",
    values: {
      evictionRatePerSec: 480,
      hitRatioPct: 18,
      memoryUtilizationPct: 99,
      dbReadsPerSec: 6_400,
      cacheLatencyMs: 55,
      apiLatencyMs: 2_600,
      cacheStatus: "critical",
      cacheRecoveryMode: "unresolved",
    },
    componentHealth: apiHealthyDbCriticalHealth,
  },

  // ── Baseline critical: eviction churn is rising after the deployment
  // and the candidate has taken no meaningfully mitigating action yet.
  {
    id: "eviction-churn-baseline",
    when: { triggerEquals: { evictionChurnRising: true } },
    incidentState: "eviction-churn-critical",
    values: {
      evictionRatePerSec: 320,
      hitRatioPct: 34,
      memoryUtilizationPct: 95,
      dbReadsPerSec: 2_400,
      cacheLatencyMs: 26,
      apiLatencyMs: 980,
      cacheStatus: "critical",
      cacheRecoveryMode: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      evictionRatePerSec: 20,
      hitRatioPct: 94,
      memoryUtilizationPct: 55,
      dbReadsPerSec: 180,
      cacheLatencyMs: 4,
      apiLatencyMs: 60,
      cacheStatus: "normal",
      cacheRecoveryMode: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
