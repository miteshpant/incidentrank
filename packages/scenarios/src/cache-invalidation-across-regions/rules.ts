import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "global-api": "healthy",
  "us-cache": "healthy",
  "eu-cache": "healthy",
  "apac-cache": "healthy",
  "origin-store": "healthy",
  "invalidation-stream": "healthy",
};

const baselineHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-cache": "critical",
  "eu-cache": "critical",
  "origin-store": "degraded",
};

const globalBypassHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-cache": "healthy",
  "eu-cache": "critical",
  "apac-cache": "degraded",
  "origin-store": "critical",
};

const usTargetedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-cache": "healthy",
  "eu-cache": "critical",
  "origin-store": "degraded",
};

const euTargetedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-cache": "critical",
  "eu-cache": "healthy",
  "origin-store": "degraded",
};

const bothTargetedRecoveringHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-cache": "degraded",
  "eu-cache": "degraded",
  "origin-store": "degraded",
};

const contagionHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "us-cache": "degraded",
  "eu-cache": "degraded",
  "apac-cache": "degraded",
  "origin-store": "degraded",
};

/**
 * Authored rule table for Cache Invalidation Across Regions, ordered
 * most-specific-first (correctness/overload traps checked before
 * capacity/partial states, which are checked before the ordinary
 * progression of targeted-fix -> isolation -> recovery-lag drain).
 *
 * ROOT CAUSE: the shared Invalidation Stream / Publisher delivers
 * asymmetrically across three parallel regional caches — delayed in
 * US (stale-read risk), duplicated/replayed in EU (revalidation-storm
 * risk), healthy in APAC. Global API itself never degrades — this must
 * not be mistaken for a single-region availability outage, and no
 * single global lever (see GLOBAL_CACHE_BYPASS_KEY) correctly treats a
 * regionally-asymmetric problem.
 *
 * HISTORICAL DAMAGE MODEL (phase6d3.md section 12): staleServesPastFreshnessBoundCount
 * only ever increases while US is actively serving stale reads beyond
 * the authored freshness bound (usFreshnessStatus = "critical"). The
 * instant US's freshness is brought back within bound — via bypass,
 * stale-while-revalidate, or (given enough elapsed recovery time) the
 * delayed invalidation stream genuinely catching up — this counter
 * FREEZES at whatever it last reached; it is never silently reset to
 * zero by that fix alone. Reaching the sustainedDesync trigger window
 * authors a materially higher frozen value than fixing quickly, via
 * the same multi-snapshot-keyed-on-elapsed-trigger-time technique
 * Ledger Reconciliation Divergence and API Migration Dual-Write
 * Failure use (no runtime accumulator in this engine).
 *
 * PRESSURE-TRANSFER MECHANISM (phase6d3.md section 13, REQUIRED,
 * real numbers): globalCacheBypass=true disables caching in ALL THREE
 * regions, including APAC, which was never broken and was carrying the
 * majority of steady-state cache-hit traffic. Every region's read
 * volume now lands on Origin Store simultaneously — originRequestsPerSec
 * and originLatencyMs come out measurably WORSE than targeted US-only
 * bypass at the identical trigger state (see
 * "global-bypass-origin-overload" vs "us-targeted-bypass-eu-storming"
 * below: 9,800 req/s vs 2,900 req/s, 3,400ms vs 410ms). This is the
 * scenario's required tempting-unsafe-path: maximal freshness, minimal
 * thought, materially worse origin outcome than a differentiated
 * per-region response.
 *
 * RECOVERY LAG (phase6d3.md section 14, REQUIRED): even once BOTH
 * regional fixes are genuinely in effect (US freshness restored, EU
 * storm stopped) AND regional invalidator isolation is on, the system
 * does not snap to "fully-recovered" on the next tick. US's delayed
 * invalidation stream needs real elapsed time to drain its in-flight
 * backlog of delayed messages; EU's cache needs real elapsed time to
 * re-warm after the storm stops thrashing it; Origin needs real
 * elapsed time for request volume to settle. This drains across three
 * real elapsed recovery windows (RECOVERY_WINDOW_1/2/FULL), never
 * instantly on the tick the controls are set.
 *
 * TEMPTING UNSAFE PATH (named above): globalCacheBypass=true.
 *
 * LEGITIMATE ACCEPTABLE TIER: staleWhileRevalidate=true for US bounds
 * US's staleness to a real, authored, bounded window (never unbounded)
 * without routing every US request to Origin — paired with EU's real
 * fix (deduplicated) and Origin protected, this is a genuinely
 * defensible "one region intentionally serving bounded stale data
 * while invalidation catches up elsewhere" handback state, not a
 * failure to be eliminated (phase6d3.md's explicit encouragement).
 *
 * CROSS-REGION CONTAGION: while EU is actively blind-replaying at high
 * volume AND regionalInvalidatorIsolation is off, EU's replay traffic
 * shares the same Invalidation Stream / Publisher connection every
 * region reads from — this measurably degrades APAC's own (previously
 * untouched) freshness too, a real, authored instance of "regional
 * isolation is preferable to global origin collapse" extended to
 * cross-region invalidator contagion, not just origin capacity.
 */
export const cacheInvalidationAcrossRegionsRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE / TEMPTING — the required global-bypass pressure-transfer
  // trap. Checked first so it always wins once selected, regardless of
  // every other control — global bypass overrides any targeted fix's
  // effect because every region's cache is disabled outright.
  // ══════════════════════════════════════════════════════════════════

  // ── Pressure-transfer compounding (checked BEFORE the plain
  // global-bypass rules below, since it is the more specific match on
  // refresh concurrency and must not be shadowed by them): global
  // bypass PLUS high refresh concurrency makes Origin overload even
  // worse — more concurrent bypassed-region refetches racing against
  // the same Origin capacity.
  {
    id: "global-bypass-high-refresh-concurrency-worse",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: { [GLOBAL_CACHE_BYPASS_KEY]: true, [REFRESH_CONCURRENCY_KEY]: "high" },
    },
    incidentState: "global-bypass-refresh-concurrency-amplified",
    values: {
      globalApiSuccessRatePct: 88,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 0,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 0,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 14_500,
      originLatencyMs: 5_600,
      originStatus: "critical",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "global-bypass-overload",
    },
    componentHealth: globalBypassHealth,
  },
  {
    id: "global-bypass-origin-overload-sustained",
    when: {
      triggerEquals: { invalidationDesyncActive: true, sustainedDesync: true },
      controlEquals: { [GLOBAL_CACHE_BYPASS_KEY]: true, [REFRESH_CONCURRENCY_KEY]: "low" },
    },
    incidentState: "global-bypass-origin-overload-sustained",
    values: {
      globalApiSuccessRatePct: 91,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 0,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 0,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 11_200,
      originLatencyMs: 4_100,
      originStatus: "critical",
      staleServesPastFreshnessBoundCount: 620,
      invalidationSystemStatus: "global-bypass-overload",
    },
    componentHealth: globalBypassHealth,
  },
  {
    id: "global-bypass-origin-overload",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: { [GLOBAL_CACHE_BYPASS_KEY]: true, [REFRESH_CONCURRENCY_KEY]: "low" },
    },
    incidentState: "global-bypass-origin-overload",
    values: {
      globalApiSuccessRatePct: 94,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 0,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 0,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 9_800,
      originLatencyMs: 3_400,
      originStatus: "critical",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "global-bypass-overload",
    },
    componentHealth: globalBypassHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // CROSS-REGION CONTAGION — EU's replay storm, unisolated, degrades
  // APAC's own invalidation delivery. Checked before the ordinary
  // targeted-fix progression so this real risk is visible whenever
  // isolation is off and EU is still actively storming.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "eu-storm-contagion-unisolated",
    when: {
      triggerEquals: { invalidationDesyncActive: true, sustainedDesync: true },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "caching",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "blind-replay",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: false,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "eu-storm-contagion-unisolated",
    values: {
      globalApiSuccessRatePct: 97,
      usCacheHitRatePct: 70,
      usStaleReadRatePct: 55,
      usFreshnessStatus: "critical",
      euCacheHitRatePct: 28,
      euRevalidationStormRatePerMin: 3_600,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 82,
      apacFreshnessStatus: "warning",
      originRequestsPerSec: 6_400,
      originLatencyMs: 1_450,
      originStatus: "critical",
      staleServesPastFreshnessBoundCount: 420,
      invalidationSystemStatus: "multi-region-degraded",
    },
    componentHealth: contagionHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // TARGETED FIXES, ONE SIDE ONLY — real, distinct, partial progress.
  // ══════════════════════════════════════════════════════════════════

  // ── US freshness fixed (bypass) AFTER the desync had already
  // compounded into its sustained window, EU still storming
  // unisolated. Checked BEFORE the plain (early-fix) variant below
  // since sustainedDesync implies invalidationDesyncActive and is the
  // more specific match — the historical stale-serve counter FREEZES
  // at the sustained value it had already reached (420) rather than
  // resetting to the smaller early-fix value, proving the counter is
  // genuinely non-resetting history, not a cosmetic per-state number.
  {
    id: "us-targeted-bypass-eu-storming-sustained",
    when: {
      triggerEquals: { invalidationDesyncActive: true, sustainedDesync: true },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "bypass",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "blind-replay",
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "us-targeted-bypass-eu-storming-sustained",
    values: {
      globalApiSuccessRatePct: 98,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 28,
      euRevalidationStormRatePerMin: 3_600,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 4_300,
      originLatencyMs: 560,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 420,
      invalidationSystemStatus: "targeted-partial",
    },
    componentHealth: usTargetedHealth,
  },

  // ── US freshness fixed (bypass) while still early (before the
  // sustained window), EU still storming unisolated. Origin absorbs
  // US's full traffic plus EU's duplicate re-fetch volume — strictly
  // less overload than global bypass at the same trigger window
  // (2,900 vs 9,800 req/s) because APAC is untouched, but still real,
  // visible pressure, and EU's root problem is entirely unaddressed.
  {
    id: "us-targeted-bypass-eu-storming",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "bypass",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "blind-replay",
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "us-targeted-bypass-eu-storming",
    values: {
      globalApiSuccessRatePct: 98,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 40,
      euRevalidationStormRatePerMin: 2_400,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 2_900,
      originLatencyMs: 410,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 60,
      invalidationSystemStatus: "targeted-partial",
    },
    componentHealth: usTargetedHealth,
  },

  // ── EU storm fixed (deduplicated), US still serving unbounded
  // stale reads. EU's load returns to normal; Origin is noticeably
  // lighter than baseline (EU's duplicate re-fetches stopped), but
  // US's stale-serve counter keeps climbing because nothing addressed
  // the delayed invalidation there at all.
  {
    id: "eu-targeted-dedup-us-stale",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: {
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [US_CACHE_MODE_KEY]: "caching",
        [STALE_WHILE_REVALIDATE_KEY]: false,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
      controlAtLeast: { [US_TTL_SECONDS_KEY]: 30 },
    },
    incidentState: "eu-targeted-dedup-us-stale",
    values: {
      globalApiSuccessRatePct: 98,
      usCacheHitRatePct: 97,
      usStaleReadRatePct: 35,
      usFreshnessStatus: "critical",
      euCacheHitRatePct: 97,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_050,
      originLatencyMs: 150,
      originStatus: "normal",
      staleServesPastFreshnessBoundCount: 70,
      invalidationSystemStatus: "targeted-partial",
    },
    componentHealth: euTargetedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE GOOD PATH / ACCEPTABLE TIER — stale-while-revalidate
  // bounds US's staleness without bypassing it outright.
  // ══════════════════════════════════════════════════════════════════

  // ── Both targeted fixes applied, isolation ON, SWR bounding US's
  // staleness instead of bypassing: a real, distinct, lower-origin-
  // pressure way to bound US freshness. New stale-serve damage stops
  // (bounded, not unbounded), EU storm stopped, isolation protects
  // cross-region contagion, Origin is healthy. This is the archetype
  // ACCEPTABLE-tier state — genuinely safe, not a failure to eliminate.
  {
    id: "bounded-acceptable-swr",
    when: {
      triggerEquals: { invalidationDesyncActive: true, recoveryWindowFullElapsed: false },
      controlEquals: {
        [STALE_WHILE_REVALIDATE_KEY]: true,
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: true,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "bounded-acceptable-swr",
    values: {
      globalApiSuccessRatePct: 99,
      usCacheHitRatePct: 95,
      usStaleReadRatePct: 8,
      usFreshnessStatus: "warning",
      euCacheHitRatePct: 97,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_150,
      originLatencyMs: 140,
      originStatus: "normal",
      staleServesPastFreshnessBoundCount: 70,
      invalidationSystemStatus: "bounded-acceptable",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // RECOVERY LAG — both regional fixes genuinely engaged (US bypass OR
  // SWR; EU deduplicated; isolation on), draining toward full recovery
  // over real elapsed time. Never instant.
  // ══════════════════════════════════════════════════════════════════

  // ── Repair just engaged (no recovery window elapsed yet): the
  // tick-zero proof that fixing the controls does not instantly drain
  // the stale-serve counter or fully settle Origin.
  {
    id: "recovery-just-engaged",
    when: {
      triggerEquals: { invalidationDesyncActive: true, recoveryWindow1Elapsed: false },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "bypass",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: true,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "recovery-just-engaged",
    values: {
      globalApiSuccessRatePct: 98,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 60,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 2_400,
      originLatencyMs: 320,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "targeted-partial",
    },
    componentHealth: bothTargetedRecoveringHealth,
  },

  // ── Recovery window 1: EU cache re-warming, Origin settling, but not
  // fully recovered yet.
  {
    id: "recovery-window1-draining",
    when: {
      triggerEquals: {
        invalidationDesyncActive: true,
        recoveryWindow1Elapsed: true,
        recoveryWindow2Elapsed: false,
      },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "bypass",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: true,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "recovery-window1-draining",
    values: {
      globalApiSuccessRatePct: 99,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 85,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_900,
      originLatencyMs: 260,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "targeted-partial",
    },
    componentHealth: usTargetedHealth,
  },

  // ── Recovery window 2: EU cache re-warmed, Origin near-normal, US
  // genuinely within bound via continued bypass.
  {
    id: "recovery-window2-near-recovered",
    when: {
      triggerEquals: {
        invalidationDesyncActive: true,
        recoveryWindow2Elapsed: true,
        recoveryWindowFullElapsed: false,
      },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "bypass",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: true,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "recovery-window2-near-recovered",
    values: {
      globalApiSuccessRatePct: 99,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 96,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_500,
      originLatencyMs: 180,
      originStatus: "normal",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "targeted-partial",
    },
    componentHealth: usTargetedHealth,
  },

  // ── OPTIMAL: full recovery window elapsed, both fixes still engaged,
  // isolation on: US genuinely within freshness bound (the delayed
  // invalidation stream has fully caught up, or bypass remains active
  // as the declared permanent posture), EU re-warmed, Origin fully
  // settled. Historical stale-serve count stays frozen (never reset)
  // but every current-health signal reads normal.
  {
    id: "fully-recovered",
    when: {
      triggerEquals: { invalidationDesyncActive: true, recoveryWindowFullElapsed: true },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "bypass",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: true,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "fully-recovered",
    values: {
      globalApiSuccessRatePct: 99,
      usCacheHitRatePct: 0,
      usStaleReadRatePct: 0,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 97,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_380,
      originLatencyMs: 150,
      originStatus: "normal",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "fully-recovered",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL, alternate single-lever form: SWR-bounded US (instead of
  // full bypass) reaching full recovery after the full window — SWR is
  // ALSO a legitimate route to the optimal tier once Origin has fully
  // settled, not merely a lesser acceptable-only lever. Distinguished
  // from bounded-acceptable-swr above (which never reaches this because
  // it is checked for ANY elapsed time, not gated on the full window) —
  // SWR genuinely drains to usStaleReadRatePct effectively zero and
  // originRequestsPerSec fully settled only after the full recovery
  // window, same as bypass.
  {
    id: "fully-recovered-via-swr",
    when: {
      triggerEquals: { invalidationDesyncActive: true, recoveryWindowFullElapsed: true },
      controlEquals: {
        [STALE_WHILE_REVALIDATE_KEY]: true,
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "deduplicated",
        [REGIONAL_INVALIDATOR_ISOLATION_KEY]: true,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "fully-recovered-via-swr",
    values: {
      globalApiSuccessRatePct: 99,
      usCacheHitRatePct: 96,
      usStaleReadRatePct: 1,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 97,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_120,
      originLatencyMs: 130,
      originStatus: "normal",
      staleServesPastFreshnessBoundCount: 70,
      invalidationSystemStatus: "fully-recovered",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PARTIAL / CAPACITY-ONLY RESPONSES — real, incomplete.
  // ══════════════════════════════════════════════════════════════════

  // ── Origin concurrency raised alone, nothing regional fixed: Origin
  // survives baseline load somewhat better (capacity absorbs some of
  // the overflow), but neither US's staleness nor EU's storm is
  // addressed — root cause fully unaddressed, real but incomplete.
  {
    id: "origin-capacity-only-partial-relief",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: {
        [ORIGIN_CONCURRENCY_KEY]: "high",
        [US_CACHE_MODE_KEY]: "caching",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "blind-replay",
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "origin-capacity-only-partial-relief",
    values: {
      globalApiSuccessRatePct: 98,
      usCacheHitRatePct: 97,
      usStaleReadRatePct: 35,
      usFreshnessStatus: "critical",
      euCacheHitRatePct: 40,
      euRevalidationStormRatePerMin: 2_400,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_400,
      originLatencyMs: 140,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 60,
      invalidationSystemStatus: "multi-region-degraded",
    },
    componentHealth: baselineHealth,
  },

  // ── High refresh concurrency while EU is STILL blind-replaying
  // (nothing fixed): more concurrent duplicate re-fetches racing for
  // the same storming keys — measurably worse than the plain baseline
  // at the identical trigger window, proving refreshConcurrency is a
  // real amplifier while broken, not a no-op.
  {
    id: "high-refresh-concurrency-amplifies-storm",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: {
        [REFRESH_CONCURRENCY_KEY]: "high",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "blind-replay",
        [US_CACHE_MODE_KEY]: "caching",
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
    },
    incidentState: "high-refresh-concurrency-amplifies-storm",
    values: {
      globalApiSuccessRatePct: 95,
      usCacheHitRatePct: 97,
      usStaleReadRatePct: 35,
      usFreshnessStatus: "critical",
      euCacheHitRatePct: 22,
      euRevalidationStormRatePerMin: 4_800,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 97,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 5_200,
      originLatencyMs: 1_100,
      originStatus: "critical",
      staleServesPastFreshnessBoundCount: 180,
      invalidationSystemStatus: "multi-region-degraded",
    },
    componentHealth: baselineHealth,
  },

  // ── Long TTL alone (900s), nothing else fixed: fewer ordinary
  // expiry-driven re-fetches reach Origin (small relief there), but
  // the worst-case staleness window before any uninvalidated value
  // naturally expires grows to match — a materially WORSE staleness
  // bound than the short-TTL baseline, the direct tradeoff this
  // scenario's business invariants name explicitly.
  {
    id: "long-ttl-worsens-staleness-bound",
    when: {
      triggerEquals: { invalidationDesyncActive: true },
      controlEquals: {
        [US_CACHE_MODE_KEY]: "caching",
        [EU_INVALIDATION_REPLAY_MODE_KEY]: "blind-replay",
        [STALE_WHILE_REVALIDATE_KEY]: false,
        [GLOBAL_CACHE_BYPASS_KEY]: false,
      },
      controlAtLeast: { [US_TTL_SECONDS_KEY]: 900 },
    },
    incidentState: "long-ttl-worsens-staleness-bound",
    values: {
      globalApiSuccessRatePct: 97,
      usCacheHitRatePct: 99,
      usStaleReadRatePct: 80,
      usFreshnessStatus: "critical",
      euCacheHitRatePct: 40,
      euRevalidationStormRatePerMin: 2_400,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_250,
      originLatencyMs: 200,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 260,
      invalidationSystemStatus: "multi-region-degraded",
    },
    componentHealth: baselineHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — invalidation desync active, no meaningful action taken
  // yet. Both regional problems actively accruing damage. NOTE: once
  // sustainedDesync fires, the default control state (US still
  // "caching", EU still "blind-replay", isolation off, bypass off)
  // actually matches "eu-storm-contagion-unisolated" above, not a
  // separate bare "sustained" rule here — contagion IS this scenario's
  // true unmitigated sustained-baseline outcome (EU's unisolated storm
  // degrading APAC too), so no redundant rule is authored for it.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-desync",
    when: { triggerEquals: { invalidationDesyncActive: true } },
    incidentState: "baseline-desync",
    values: {
      globalApiSuccessRatePct: 98,
      usCacheHitRatePct: 97,
      usStaleReadRatePct: 35,
      usFreshnessStatus: "critical",
      euCacheHitRatePct: 40,
      euRevalidationStormRatePerMin: 2_400,
      euInvalidationStormStatus: "critical",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 1_400,
      originLatencyMs: 220,
      originStatus: "warning",
      staleServesPastFreshnessBoundCount: 60,
      invalidationSystemStatus: "multi-region-degraded",
    },
    componentHealth: baselineHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      globalApiSuccessRatePct: 99,
      usCacheHitRatePct: 98,
      usStaleReadRatePct: 1,
      usFreshnessStatus: "normal",
      euCacheHitRatePct: 98,
      euRevalidationStormRatePerMin: 0,
      euInvalidationStormStatus: "normal",
      apacCacheHitRatePct: 98,
      apacFreshnessStatus: "normal",
      originRequestsPerSec: 900,
      originLatencyMs: 120,
      originStatus: "normal",
      staleServesPastFreshnessBoundCount: 0,
      invalidationSystemStatus: "fully-recovered",
    },
    componentHealth: healthyHealth,
  },
];
