import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CACHING_ENABLED_KEY,
  DEPENDENCY_CONCURRENCY_KEY,
  OPTIONAL_FEATURE_SUPPRESSED_KEY,
  PRIORITY_TRAFFIC_POLICY_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  RETRY_AGGRESSIVENESS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "aggregation-service": "healthy",
  "third-party-dependency": "healthy",
};

const warningHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  "aggregation-service": "degraded",
  "third-party-dependency": "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "degraded",
  "aggregation-service": "critical",
  "third-party-dependency": "critical",
};

const exhaustedHealth: Record<string, ComponentHealth> = {
  clients: "degraded",
  api: "critical",
  "aggregation-service": "critical",
  "third-party-dependency": "critical",
};

/**
 * Authored rule table for Dependency Rate-Limit Exhaustion, ordered
 * most-specific first. The third-party dependency enforces a hard quota
 * on a rolling 10-minute window. Once call volume against it starts
 * climbing, the candidate has several genuinely durable or acceptable
 * levers (caching, coalescing, priority traffic policy, feature
 * suppression, capped concurrency) and one binding trap: raising retry
 * aggressiveness once 429s are already occurring. Against a HARD quota
 * every retry is itself another counted request, so "aggressive"
 * retries during active throttling make both the 429 rate and the
 * application success rate measurably WORSE than doing nothing, and
 * drive the quota to complete exhaustion before the window resets.
 */
export const dependencyRateLimitExhaustionRules: Rule[] = [
  // ── Optimal recovery: caching AND request coalescing both enabled.
  // Repeat lookups are served from cache and concurrent duplicate
  // in-flight requests are merged into one call, so call volume against
  // the dependency drops durably below the quota's sustainable burn
  // rate for the rest of the window — not just a momentary dip. Checked
  // first so it wins over every other control combination once both are
  // applied, regardless of retry/priority/concurrency settings.
  {
    id: "caching-and-coalescing-recovery",
    when: {
      triggerEquals: { quotaDrawingDown: true },
      controlEquals: {
        [CACHING_ENABLED_KEY]: true,
        [REQUEST_COALESCING_ENABLED_KEY]: true,
      },
    },
    incidentState: "sustained-under-quota-caching",
    values: {
      quotaRemainingPct: 74,
      dependency429RatePerMin: 0,
      applicationSuccessRatePct: 100,
      retryVolumePerMin: 0,
      cacheHitRatePct: 68,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 260,
      quotaStatus: "normal",
      quotaOutcome: "sustained-under-quota",
    },
    componentHealth: healthyHealth,
  },

  // ── Alternate good path: priority-only traffic policy once quota is
  // tight. Lower-priority lookups are deferred/dropped entirely, so only
  // the traffic that genuinely needs the dependency keeps calling it —
  // call volume falls below the sustainable burn rate without needing
  // caching or coalescing at all. A real, different tradeoff: it works
  // by shedding lower-priority work, not by making every request
  // cheaper.
  {
    id: "priority-only-recovery",
    when: {
      triggerEquals: { quotaDrawingDown: true },
      controlEquals: { [PRIORITY_TRAFFIC_POLICY_KEY]: "priority-only" },
    },
    incidentState: "sustained-under-quota-priority",
    values: {
      quotaRemainingPct: 70,
      dependency429RatePerMin: 0,
      applicationSuccessRatePct: 98,
      retryVolumePerMin: 0,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 300,
      quotaStatus: "normal",
      quotaOutcome: "sustained-under-quota",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable, not optimal: the optional enrichment feature is
  // suppressed. Call volume against the dependency drops because an
  // entire category of calls has been turned off, not because
  // per-request efficiency improved. Every customer-facing quota metric
  // recovers, but the suppressed feature itself is unavailable to
  // customers for as long as it stays off.
  {
    id: "feature-suppressed-safe-but-reduced",
    when: {
      triggerEquals: { quotaDrawingDown: true },
      controlEquals: { [OPTIONAL_FEATURE_SUPPRESSED_KEY]: true },
    },
    incidentState: "feature-suppressed",
    values: {
      quotaRemainingPct: 66,
      dependency429RatePerMin: 0,
      applicationSuccessRatePct: 100,
      retryVolumePerMin: 0,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 340,
      quotaStatus: "normal",
      quotaOutcome: "feature-suppressed",
    },
    componentHealth: healthyHealth,
  },

  // ── THE TRAP: retry aggressiveness raised to "aggressive" once the
  // provider is already throttling (429s already occurring). Against a
  // hard rolling-window quota, every retry attempt is itself another
  // request counted against the SAME shrinking window. Firing immediate,
  // repeated retries while already being throttled measurably
  // ACCELERATES quota exhaustion: both the 429 rate and the application
  // success rate get WORSE than the unmitigated baseline below, and the
  // remaining quota is driven to zero well before the window would have
  // reset on its own.
  {
    id: "aggressive-retry-accelerates-exhaustion",
    when: {
      triggerEquals: { providerThrottling: true },
      controlEquals: { [RETRY_AGGRESSIVENESS_KEY]: "aggressive" },
    },
    incidentState: "retry-accelerated-exhaustion",
    values: {
      quotaRemainingPct: 0,
      dependency429RatePerMin: 420,
      applicationSuccessRatePct: 38,
      retryVolumePerMin: 980,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 60,
      dependencyCallVolumePerMin: 2_600,
      quotaStatus: "critical",
      quotaOutcome: "exhausted",
    },
    componentHealth: exhaustedHealth,
  },

  // ── Partial relief: dependency concurrency capped alone (retries left
  // at the default "normal"). Smooths bursts and trims some call volume
  // by naturally queueing excess demand, but is not enough by itself to
  // bring volume below the quota's sustainable burn rate once the
  // provider is already throttling — relief is real but incomplete.
  {
    id: "capped-concurrency-partial-relief",
    when: {
      triggerEquals: { providerThrottling: true },
      controlEquals: {
        [DEPENDENCY_CONCURRENCY_KEY]: "capped",
        [RETRY_AGGRESSIVENESS_KEY]: "normal",
        [CACHING_ENABLED_KEY]: false,
        [REQUEST_COALESCING_ENABLED_KEY]: false,
        [OPTIONAL_FEATURE_SUPPRESSED_KEY]: false,
        [PRIORITY_TRAFFIC_POLICY_KEY]: "all-equal",
      },
    },
    incidentState: "capped-concurrency-partial",
    values: {
      quotaRemainingPct: 22,
      dependency429RatePerMin: 90,
      applicationSuccessRatePct: 78,
      retryVolumePerMin: 180,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 1_050,
      quotaStatus: "warning",
      quotaOutcome: "unresolved",
    },
    componentHealth: warningHealth,
  },

  // ── Baseline critical, post-throttling: the provider has started
  // returning 429s and the candidate has taken no meaningfully
  // mitigating action. Retries remain at the default "normal" (bounded,
  // backed off) so this is a real but not accelerated decline — the
  // reference point the aggressive-retry trap above must be measurably
  // worse than.
  {
    id: "provider-throttling-baseline",
    when: { triggerEquals: { providerThrottling: true } },
    incidentState: "provider-throttling",
    values: {
      quotaRemainingPct: 14,
      dependency429RatePerMin: 180,
      applicationSuccessRatePct: 64,
      retryVolumePerMin: 260,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 1_300,
      quotaStatus: "critical",
      quotaOutcome: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Warning, pre-throttling: quota is drawing down and visibly on
  // pace to exhaust before the window resets, but the provider has not
  // started returning 429s yet. This is the observable precursor window
  // for provider-throttling-baseline — quotaRemainingPct is already
  // falling and dependencyCallVolumePerMin is already elevated well
  // before any 429 appears.
  {
    id: "quota-drawdown-warning",
    when: { triggerEquals: { quotaDrawingDown: true } },
    incidentState: "quota-drawing-down",
    values: {
      quotaRemainingPct: 48,
      dependency429RatePerMin: 0,
      applicationSuccessRatePct: 99,
      retryVolumePerMin: 20,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 1_000,
      quotaStatus: "warning",
      quotaOutcome: "unresolved",
    },
    componentHealth: warningHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      quotaRemainingPct: 100,
      dependency429RatePerMin: 0,
      applicationSuccessRatePct: 100,
      retryVolumePerMin: 0,
      cacheHitRatePct: 0,
      requestPriorityMixPct: 100,
      dependencyCallVolumePerMin: 1_000,
      quotaStatus: "normal",
      quotaOutcome: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
