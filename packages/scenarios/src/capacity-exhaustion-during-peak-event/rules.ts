import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ADMISSION_CONTROL_KEY,
  API_CONCURRENCY_KEY,
  ASYNC_DEFERRAL_KEY,
  CACHE_STRATEGY_KEY,
  DB_CONNECTION_BUDGET_KEY,
  LOAD_SHEDDING_KEY,
  OPTIONAL_FEATURE_DISABLE_KEY,
  REGIONAL_ROUTING_KEY,
  TRAFFIC_CLASS_PRIORITY_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "edge-cdn": "healthy",
  "api-fleet": "healthy",
  "payment-service": "healthy",
  "search-service": "healthy",
  cache: "healthy",
  database: "healthy",
  "async-queue": "healthy",
  "async-workers": "healthy",
};

const escalatingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "edge-cdn": "degraded",
  "api-fleet": "degraded",
  cache: "degraded",
  database: "degraded",
  "async-queue": "degraded",
};

const dbCollapseRiskHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "edge-cdn": "degraded",
  "api-fleet": "critical",
  cache: "critical",
  database: "critical",
  "payment-service": "critical",
  "async-queue": "critical",
  "async-workers": "degraded",
};

const criticalTrafficDroppedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "edge-cdn": "critical",
  "api-fleet": "critical",
  "payment-service": "critical",
  cache: "degraded",
  database: "degraded",
};

const safeDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  cache: "degraded",
  database: "degraded",
  "search-service": "degraded",
  "async-queue": "degraded",
};

const convergingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  cache: "degraded",
  database: "degraded",
  "async-queue": "degraded",
};

const optimalDisabledSearchHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "search-service": "degraded",
};

/**
 * Authored rule table for Capacity Exhaustion During Peak Event,
 * ordered most-specific-first (first-match-wins, top-to-bottom).
 *
 * ROOT MECHANISM: traffic is 100% legitimate, expected peak-event
 * demand. It cannot be blocked wholesale (unlike bot-traffic-surge's
 * adversarial traffic, or api-traffic-spike's single cache/DB
 * bottleneck). Every layer's pressure genuinely interacts: Edge/API
 * pressure widens the cache's effective key-access pattern (hit rate
 * falls) -> more cache-miss volume reaches the database -> the database
 * approaches real saturation risk -> synchronous work backing up onto
 * the database pushes MORE work onto the async queue -> and the whole
 * system's aggregate ("global") success rate can look fine even while
 * the one path that actually matters (checkout) is degrading, which is
 * the scenario's central trap.
 *
 * PRESSURE-TRANSFER MECHANISM #1 (apiConcurrency, phase6d.4.md section
 * 14): raising API Fleet concurrency alone (without a bounded DB
 * connection budget AND without shedding optional traffic) looks like
 * "scaling up" but simply admits more concurrent requests into Cache
 * and Database at once — dbConnectionUtilizationPercent rises
 * measurably higher than the unaddressed baseline at the same elapsed
 * time. See "capacity-escalation-trap" below.
 *
 * PRESSURE-TRANSFER MECHANISM #2 (loadShedding="random-shed", the named
 * anti-pattern): a blunt, non-policy-based admission cut reduces total
 * volume and superficially improves every aggregate metric, but sheds
 * checkout/transaction traffic in direct proportion to its share of
 * total volume — this is NOT "policy-based" shedding (business
 * invariant #5) and is this scenario's HISTORICAL DAMAGE trigger:
 * cumulativeCriticalTrafficDroppedCount increases, permanently, the
 * instant this is active, and is never erased by switching it off
 * later. See "random-shed-historical-damage" below.
 *
 * PRESSURE-TRANSFER MECHANISM #3 (workerConcurrency="high" while the
 * database is still under real pressure): aggressively draining the
 * async backlog moves pressure OFF the queue and directly ONTO the
 * same database the critical path depends on (async-workers ->
 * database, see architecture.ts) — the backlog metric improves while
 * dbConnectionUtilizationPercent rises, a real, measurable, and
 * dangerous trade while sustainedPeak/dbRecoveryFullyDone has not yet
 * been reached. See "premature-worker-drain-trap" below.
 *
 * RECOVERY LAG (phase6d.4.md section 15, modeled across TWO
 * independent subsystems, never a single combined "health" dial):
 *   - Cache warmup: cacheHitRatePercent only climbs back up across
 *     CACHE_WARMUP_WINDOW_1_MS / CACHE_WARMUP_FULLY_DONE_MS once
 *     cacheStrategy=extended-ttl is engaged.
 *   - DB connection pool recovery: dbConnectionUtilizationPercent only
 *     drains back down across DB_RECOVERY_WINDOW_1_MS /
 *     DB_RECOVERY_FULLY_DONE_MS once DB-side demand has genuinely been
 *     reduced (bounded budget + optional traffic shed/disabled + no
 *     premature worker-drain).
 * A candidate who fixes only one side sees only that one subsystem's
 * metric recover — proof these are genuinely separate mechanisms.
 *
 * LEGITIMATE DEGRADED-BUT-SAFE STATE: "safe-degraded-protected" —
 * critical path fully protected (checkoutSuccessRatePercent high),
 * optional path explicitly degraded/disabled, async queue bounded and
 * demonstrably draining, database never pushed into its critical
 * saturation band. Reachable immediately (no elapsed-time wait)
 * once the right controls are set, and remains ACCEPTABLE for as long
 * as the candidate chooses not to pursue full recovery.
 *
 * TWO MATERIALLY DISTINCT STRONG STRATEGIES (both independently reach
 * OPTIMAL, see "strategy-a..." / "strategy-b..." below):
 *   A. Shed-and-protect: trafficClassPriority=shed-optional (or
 *      shed-aggressive) + admissionControl=protect-critical +
 *      dbConnectionBudget=bounded + optionalFeatureDisable=disabled +
 *      cacheStrategy=extended-ttl + asyncDeferral=defer-to-queue, with
 *      workerConcurrency left at standard until the DB has genuinely
 *      recovered. Search ends up fully DISABLED.
 *   B. Regional-split-and-degrade: regionalRouting=split-regional +
 *      cacheStrategy=extended-ttl + dbConnectionBudget=bounded +
 *      trafficClassPriority=shed-optional + admissionControl=protect-
 *      critical, WITHOUT ever disabling search entirely. Relieves
 *      Edge/API/Cache pressure by routing a share of read-mostly
 *      traffic to a second region's stack (never DB pressure directly,
 *      since both regions share one database — see controls.ts), and
 *      keeps search running in a bounded/throttled form rather than
 *      off. This is a genuinely different operational choice (regional
 *      capacity + partial degrade vs. full feature sacrifice + deferral),
 *      not a parameter variation of strategy A.
 *
 * THE TEMPTING UNSAFE PATH: maximizing globalSuccessRatePercent (the
 * aggregate vanity metric) by keeping optionalFeatureDisable=enabled
 * and trafficClassPriority=all-admitted "because the numbers look
 * fine" is exactly wrong — checkoutSuccessRatePercent and
 * dbSaturationStatus are what this scenario actually grades on, and
 * leaving optional traffic fully admitted keeps real pressure on the
 * shared cache/DB tier that the critical path also depends on.
 */
export const capacityExhaustionDuringPeakEventRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS/POLICY TRAPS — checked first, win regardless of
  // every other control.
  // ══════════════════════════════════════════════════════════════════

  // ── Historical damage trigger, sustained: non-policy-based random
  // shedding left active long enough that the cumulative count of
  // indiscriminately dropped checkout/transaction requests approaches
  // the failure threshold. Checked before the base random-shed rule
  // (more specific: also requires the sustained-window trigger) so a
  // candidate who leaves this on long enough is correctly routed here
  // instead of being shadowed by the less-specific rule below.
  {
    id: "random-shed-sustained-historical-damage",
    when: {
      triggerEquals: { peakEventActive: true, randomShedSustainedWindowElapsed: true },
      controlEquals: { [LOAD_SHEDDING_KEY]: "random-shed" },
    },
    incidentState: "random-shed-sustained",
    values: {
      checkoutSuccessRatePercent: 89.0,
      checkoutLatencyMs: 260,
      cacheHitRatePercent: 66,
      dbConnectionUtilizationPercent: 55,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 55,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 92,
      globalSuccessRatePercent: 93.0,
      cumulativeCriticalTrafficDroppedCount: 520,
      peakEventStatus: "critical-traffic-dropped",
    },
    componentHealth: criticalTrafficDroppedHealth,
  },

  // ── Historical damage trigger: non-policy-based random shedding.
  // Checked before every other rule (even DB-collapse) because this is
  // a POLICY violation independent of whatever else is happening —
  // business invariant #5 is violated the instant this is active.
  {
    id: "random-shed-historical-damage",
    when: {
      triggerEquals: { peakEventActive: true },
      controlEquals: { [LOAD_SHEDDING_KEY]: "random-shed" },
    },
    incidentState: "random-shed-active",
    values: {
      checkoutSuccessRatePercent: 91.5,
      checkoutLatencyMs: 240,
      cacheHitRatePercent: 70,
      dbConnectionUtilizationPercent: 58,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 60,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 93,
      globalSuccessRatePercent: 94.0,
      cumulativeCriticalTrafficDroppedCount: 180,
      peakEventStatus: "critical-traffic-dropped",
    },
    componentHealth: criticalTrafficDroppedHealth,
  },

  // ── DB actively being pushed into collapse: checked next (after the
  // policy trap), wins over every control combination that has not
  // relieved real DB pressure yet. sustainedPeak + apiConcurrency high
  // + no DB budget + optional traffic still fully admitted is the
  // worst reachable live-pressure state.
  {
    id: "db-collapse-risk-escalation-trap",
    when: {
      triggerEquals: { sustainedPeak: true },
      controlEquals: {
        [API_CONCURRENCY_KEY]: "high",
        [DB_CONNECTION_BUDGET_KEY]: "unbounded",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "enabled",
      },
    },
    incidentState: "capacity-escalation-trap",
    values: {
      checkoutSuccessRatePercent: 78.0,
      checkoutLatencyMs: 920,
      cacheHitRatePercent: 54,
      dbConnectionUtilizationPercent: 97,
      dbSaturationStatus: "critical",
      asyncQueueBacklogCount: 410,
      asyncQueueDrainingStatus: "growing",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 71,
      globalSuccessRatePercent: 85.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "db-collapse-risk",
    },
    componentHealth: dbCollapseRiskHealth,
  },

  // ── Premature worker-drain trap: aggressively draining the async
  // backlog while the database has NOT yet genuinely recovered —
  // pressure-transfer mechanism #3. Backlog looks great; the database
  // gets worse. Checked before the safe/optimal states below so this
  // trap is never shadowed once reachable.
  {
    id: "premature-worker-drain-trap",
    when: {
      triggerEquals: { sustainedPeak: true, dbRecoveryFullyDone: false },
      controlEquals: { [WORKER_CONCURRENCY_KEY]: "high" },
    },
    incidentState: "premature-worker-drain",
    values: {
      checkoutSuccessRatePercent: 88.0,
      checkoutLatencyMs: 540,
      cacheHitRatePercent: 68,
      dbConnectionUtilizationPercent: 91,
      dbSaturationStatus: "critical",
      asyncQueueBacklogCount: 15,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 80,
      globalSuccessRatePercent: 93.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "db-collapse-risk",
    },
    componentHealth: dbCollapseRiskHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // STRATEGY A — shed-and-protect, converging toward OPTIMAL across
  // both independent recovery-lag windows.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL (strategy A): full stack of controls applied AND both
  // recovery windows (cache warmup + DB pool recovery) fully elapsed.
  // Search ends up fully disabled — the "complete sacrifice" route.
  {
    id: "strategy-a-optimal",
    when: {
      triggerEquals: { cacheWarmupFullyDone: true, dbRecoveryFullyDone: true, queueDrainFullyDone: true },
      controlEquals: {
        [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional",
        [ADMISSION_CONTROL_KEY]: "protect-critical",
        [DB_CONNECTION_BUDGET_KEY]: "bounded",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "disabled",
        [CACHE_STRATEGY_KEY]: "extended-ttl",
        [ASYNC_DEFERRAL_KEY]: "defer-to-queue",
      },
    },
    incidentState: "strategy-a-optimal",
    values: {
      checkoutSuccessRatePercent: 99.8,
      checkoutLatencyMs: 140,
      cacheHitRatePercent: 95,
      dbConnectionUtilizationPercent: 32,
      dbSaturationStatus: "normal",
      asyncQueueBacklogCount: 5,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "disabled",
      searchSuccessRatePercent: 0,
      globalSuccessRatePercent: 93.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "optimal-protected",
    },
    componentHealth: optimalDisabledSearchHealth,
  },

  // ── Strategy A, DB recovered but cache/queue still catching up: the
  // DB connection pool recovery window has independently completed
  // while cache warmup and queue drain have not — proof the two
  // recovery-lag mechanisms genuinely progress on separate clocks, not
  // as one combined "health" dial. Checked BEFORE the general
  // strategy-a-converging rule (more specific: also requires
  // dbRecoveryFullyDone) so a candidate who has waited exactly long
  // enough for DB recovery alone sees the DB-specific metric move
  // while cache/queue have not yet.
  {
    id: "strategy-a-db-recovered-cache-queue-pending",
    when: {
      triggerEquals: {
        sustainedPeak: true,
        dbRecoveryFullyDone: true,
        cacheWarmupFullyDone: false,
      },
      controlEquals: {
        [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional",
        [ADMISSION_CONTROL_KEY]: "protect-critical",
        [DB_CONNECTION_BUDGET_KEY]: "bounded",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "disabled",
        [CACHE_STRATEGY_KEY]: "extended-ttl",
        [ASYNC_DEFERRAL_KEY]: "defer-to-queue",
      },
    },
    incidentState: "strategy-a-db-recovered-cache-pending",
    values: {
      checkoutSuccessRatePercent: 99.5,
      checkoutLatencyMs: 165,
      cacheHitRatePercent: 83,
      dbConnectionUtilizationPercent: 34,
      dbSaturationStatus: "normal",
      asyncQueueBacklogCount: 30,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "disabled",
      searchSuccessRatePercent: 0,
      globalSuccessRatePercent: 92.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "safe-degraded",
    },
    componentHealth: convergingHealth,
  },

  // ── Strategy A, converging: full control stack applied, but the
  // recovery windows have not both fully elapsed yet — real, partial
  // progress, proving the recovery lag is genuine (never instant).
  {
    id: "strategy-a-converging",
    when: {
      triggerEquals: { sustainedPeak: true },
      controlEquals: {
        [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional",
        [ADMISSION_CONTROL_KEY]: "protect-critical",
        [DB_CONNECTION_BUDGET_KEY]: "bounded",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "disabled",
        [CACHE_STRATEGY_KEY]: "extended-ttl",
        [ASYNC_DEFERRAL_KEY]: "defer-to-queue",
      },
    },
    incidentState: "strategy-a-converging",
    values: {
      checkoutSuccessRatePercent: 99.3,
      checkoutLatencyMs: 190,
      cacheHitRatePercent: 80,
      dbConnectionUtilizationPercent: 55,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 45,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "disabled",
      searchSuccessRatePercent: 0,
      globalSuccessRatePercent: 91.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "safe-degraded",
    },
    componentHealth: convergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // STRATEGY B — regional-split-and-degrade, a materially distinct
  // second strong path. Never disables search entirely; relieves
  // Edge/API/Cache pressure via regional split instead.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL (strategy B): regional split + cache/DB protection +
  // policy-based shedding, both recovery windows fully elapsed, search
  // left running in a degraded (not disabled) form.
  {
    id: "strategy-b-optimal",
    when: {
      triggerEquals: { cacheWarmupFullyDone: true, dbRecoveryFullyDone: true, queueDrainFullyDone: true },
      controlEquals: {
        [REGIONAL_ROUTING_KEY]: "split-regional",
        [CACHE_STRATEGY_KEY]: "extended-ttl",
        [DB_CONNECTION_BUDGET_KEY]: "bounded",
        [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional",
        [ADMISSION_CONTROL_KEY]: "protect-critical",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "enabled",
      },
    },
    incidentState: "strategy-b-optimal",
    values: {
      checkoutSuccessRatePercent: 99.6,
      checkoutLatencyMs: 150,
      cacheHitRatePercent: 93,
      dbConnectionUtilizationPercent: 35,
      dbSaturationStatus: "normal",
      asyncQueueBacklogCount: 8,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "degraded",
      searchSuccessRatePercent: 60,
      globalSuccessRatePercent: 96.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "optimal-protected",
    },
    componentHealth: safeDegradedHealth,
  },

  // ── Strategy B, converging.
  {
    id: "strategy-b-converging",
    when: {
      triggerEquals: { sustainedPeak: true },
      controlEquals: {
        [REGIONAL_ROUTING_KEY]: "split-regional",
        [CACHE_STRATEGY_KEY]: "extended-ttl",
        [DB_CONNECTION_BUDGET_KEY]: "bounded",
        [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional",
        [ADMISSION_CONTROL_KEY]: "protect-critical",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "enabled",
      },
    },
    incidentState: "strategy-b-converging",
    values: {
      checkoutSuccessRatePercent: 98.9,
      checkoutLatencyMs: 205,
      cacheHitRatePercent: 81,
      dbConnectionUtilizationPercent: 57,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 50,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "degraded",
      searchSuccessRatePercent: 58,
      globalSuccessRatePercent: 94.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "safe-degraded",
    },
    componentHealth: convergingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE DEGRADED STATE — legitimate, immediately reachable, no
  // elapsed-time wait required. Critical path protected, optional path
  // sacrificed, queue bounded and draining, DB never collapsing. Listed
  // AFTER both strategies' optimal/converging rules (which require this
  // exact same core 4-control combination PLUS additional controls) so
  // a candidate who has also engaged cacheStrategy/asyncDeferral/
  // regionalRouting correctly matches the more specific, more complete
  // strategy rule instead of being shadowed back down to this baseline
  // degraded tier.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-degraded-protected",
    when: {
      triggerEquals: { peakEventActive: true },
      controlEquals: {
        [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional",
        [ADMISSION_CONTROL_KEY]: "protect-critical",
        [DB_CONNECTION_BUDGET_KEY]: "bounded",
        [OPTIONAL_FEATURE_DISABLE_KEY]: "disabled",
      },
    },
    incidentState: "safe-degraded-protected",
    values: {
      checkoutSuccessRatePercent: 99.1,
      checkoutLatencyMs: 210,
      cacheHitRatePercent: 74,
      dbConnectionUtilizationPercent: 68,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 90,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "disabled",
      searchSuccessRatePercent: 0,
      globalSuccessRatePercent: 91.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "safe-degraded",
    },
    componentHealth: safeDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PRESSURE-TRANSFER TRAP #1 (apiConcurrency alone, before sustained)
  // — reachable earlier than the full db-collapse-risk escalation
  // trap, proving the mechanism is real at the first opportunity it
  // can fire, not only once the incident is already at its worst.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "capacity-escalation-early",
    when: {
      triggerEquals: { cacheDegraded: true },
      controlEquals: { [API_CONCURRENCY_KEY]: "high", [DB_CONNECTION_BUDGET_KEY]: "unbounded" },
    },
    incidentState: "capacity-escalation-early",
    values: {
      checkoutSuccessRatePercent: 93.0,
      checkoutLatencyMs: 410,
      cacheHitRatePercent: 60,
      dbConnectionUtilizationPercent: 84,
      dbSaturationStatus: "critical",
      asyncQueueBacklogCount: 180,
      asyncQueueDrainingStatus: "growing",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 85,
      globalSuccessRatePercent: 91.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "db-collapse-risk",
    },
    componentHealth: dbCollapseRiskHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PARTIAL / NEUTRAL INTERMEDIATE STATES — real but incomplete relief.
  // ══════════════════════════════════════════════════════════════════

  // ── Optional traffic shed at the edge but DB budget left unbounded
  // and optional feature left enabled downstream: real partial relief
  // (less volume admitted), but the database is not yet actively
  // protected and the search service is still consuming whatever
  // optional traffic slips through other paths (e.g. direct
  // personalization calls embedded in already-admitted pages).
  {
    id: "shed-optional-only-partial",
    when: {
      triggerEquals: { peakEventActive: true },
      controlEquals: { [TRAFFIC_CLASS_PRIORITY_KEY]: "shed-optional" },
    },
    incidentState: "shed-optional-only",
    values: {
      checkoutSuccessRatePercent: 97.0,
      checkoutLatencyMs: 310,
      cacheHitRatePercent: 71,
      dbConnectionUtilizationPercent: 72,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 140,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "degraded",
      searchSuccessRatePercent: 55,
      globalSuccessRatePercent: 89.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: escalatingHealth,
  },

  // ── Cache strategy improved alone: real, meaningful, but partial —
  // reduces DB-bound volume without protecting the DB directly or
  // sacrificing anything optional. Proves cache strategy is a genuine,
  // distinct lever rather than dead or purely cosmetic.
  {
    id: "cache-strategy-only-partial",
    when: {
      triggerEquals: { cacheDegraded: true },
      controlEquals: { [CACHE_STRATEGY_KEY]: "extended-ttl" },
    },
    incidentState: "cache-strategy-only",
    values: {
      checkoutSuccessRatePercent: 95.5,
      checkoutLatencyMs: 260,
      cacheHitRatePercent: 85,
      dbConnectionUtilizationPercent: 64,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 150,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 88,
      globalSuccessRatePercent: 93.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: escalatingHealth,
  },

  // ── DB connection budget bounded alone: protects the database from
  // collapse (dbSaturationStatus never reaches critical) but excess
  // demand is now queueing/rejecting at the DB's own admission edge,
  // which shows up as degraded checkout latency/success rather than a
  // clean fix — proving "bounded alone" is real but insufficient
  // without also reducing demand.
  {
    id: "db-budget-only-partial",
    when: {
      triggerEquals: { sustainedPeak: true },
      controlEquals: { [DB_CONNECTION_BUDGET_KEY]: "bounded", [OPTIONAL_FEATURE_DISABLE_KEY]: "enabled" },
    },
    incidentState: "db-budget-only",
    values: {
      checkoutSuccessRatePercent: 94.0,
      checkoutLatencyMs: 480,
      cacheHitRatePercent: 56,
      dbConnectionUtilizationPercent: 80,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 300,
      asyncQueueDrainingStatus: "growing",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 74,
      globalSuccessRatePercent: 89.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: escalatingHealth,
  },

  // ── Async deferral alone (synchronous work moved off the critical
  // request path onto the queue): relieves DB connection HOLD time on
  // checkout requests, a real and genuine partial improvement, but
  // does nothing about cache effectiveness or inbound admission
  // volume, so the database is still under real pressure from
  // cache-miss volume alone.
  {
    id: "async-deferral-only-partial",
    when: {
      triggerEquals: { sustainedPeak: true },
      controlEquals: { [ASYNC_DEFERRAL_KEY]: "defer-to-queue" },
    },
    incidentState: "async-deferral-only",
    values: {
      checkoutSuccessRatePercent: 95.0,
      checkoutLatencyMs: 300,
      cacheHitRatePercent: 50,
      dbConnectionUtilizationPercent: 76,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 220,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 72,
      globalSuccessRatePercent: 90.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: escalatingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SEQUENCING / ESCALATION — unaddressed over elapsed time.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-worse",
    when: { triggerEquals: { sustainedPeak: true } },
    incidentState: "baseline-sustained",
    values: {
      checkoutSuccessRatePercent: 89.0,
      checkoutLatencyMs: 560,
      cacheHitRatePercent: 50,
      dbConnectionUtilizationPercent: 88,
      dbSaturationStatus: "critical",
      asyncQueueBacklogCount: 350,
      asyncQueueDrainingStatus: "growing",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 68,
      globalSuccessRatePercent: 86.0,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "db-collapse-risk",
    },
    componentHealth: dbCollapseRiskHealth,
  },
  {
    id: "baseline-cache-degraded",
    when: { triggerEquals: { cacheDegraded: true } },
    incidentState: "baseline-cache-degraded",
    values: {
      checkoutSuccessRatePercent: 96.5,
      checkoutLatencyMs: 300,
      cacheHitRatePercent: 66,
      dbConnectionUtilizationPercent: 68,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 120,
      asyncQueueDrainingStatus: "growing",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 90,
      globalSuccessRatePercent: 92.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: escalatingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — peak event active, no meaningful action yet.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-escalating",
    when: { triggerEquals: { peakEventActive: true } },
    incidentState: "baseline-escalating",
    values: {
      checkoutSuccessRatePercent: 98.5,
      checkoutLatencyMs: 230,
      cacheHitRatePercent: 80,
      dbConnectionUtilizationPercent: 52,
      dbSaturationStatus: "warning",
      asyncQueueBacklogCount: 70,
      asyncQueueDrainingStatus: "growing",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 95,
      globalSuccessRatePercent: 95.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: escalatingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      checkoutSuccessRatePercent: 99.6,
      checkoutLatencyMs: 180,
      cacheHitRatePercent: 92,
      dbConnectionUtilizationPercent: 35,
      dbSaturationStatus: "normal",
      asyncQueueBacklogCount: 40,
      asyncQueueDrainingStatus: "draining",
      searchAvailabilityStatus: "normal",
      searchSuccessRatePercent: 97,
      globalSuccessRatePercent: 96.5,
      cumulativeCriticalTrafficDroppedCount: 0,
      peakEventStatus: "escalating",
    },
    componentHealth: healthyHealth,
  },
];
