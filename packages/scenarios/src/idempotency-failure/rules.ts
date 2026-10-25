import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "request-source": "healthy",
  "service-a": "healthy",
  "queue-worker": "healthy",
  "idempotency-store": "healthy",
  "external-side-effect": "healthy",
};

const storeDegradedHealth: Record<string, ComponentHealth> = {
  "request-source": "healthy",
  "service-a": "healthy",
  "queue-worker": "degraded",
  "idempotency-store": "degraded",
  "external-side-effect": "healthy",
};

// The core trap snapshot: the worker/side-effect path looks healthy or
// even busy-but-fine (fail-open keeps requests flowing), while the
// idempotency store itself is the thing that is actually unsafe.
const lookingHealthyButUnsafeHealth: Record<string, ComponentHealth> = {
  "request-source": "healthy",
  "service-a": "healthy",
  "queue-worker": "healthy",
  "idempotency-store": "critical",
  "external-side-effect": "critical",
};

const storeCriticalHealth: Record<string, ComponentHealth> = {
  "request-source": "healthy",
  "service-a": "degraded",
  "queue-worker": "critical",
  "idempotency-store": "critical",
  "external-side-effect": "critical",
};

const failClosedDegradedHealth: Record<string, ComponentHealth> = {
  "request-source": "healthy",
  "service-a": "degraded",
  "queue-worker": "degraded",
  "idempotency-store": "degraded",
  "external-side-effect": "healthy",
};

/**
 * Authored rule table for Idempotency Failure, ordered most-specific
 * first. The idempotency STORE itself (not the request/retry/ack layer
 * above it) is what is actually broken — its primary node degrades, and
 * on single-node storage that degradation escalates to the store becoming
 * effectively unreachable. Two independent, genuinely distinct root
 * causes are modeled, both reachable while an otherwise well-behaved
 * worker/retry layer does nothing wrong on its own:
 *
 *   1. Key eviction: a short key TTL evicts a processed key's record
 *      before the worker's own slowest legitimate retry can arrive, so
 *      that retry looks, to the store, like a brand-new request — this
 *      happens even while the store is technically reachable.
 *   2. Store unreachability: once the store cannot be queried at all,
 *      "fail-open" proceeds with the external side effect anyway
 *      (duplicates accumulate silently while throughput/success-rate
 *      metrics look healthy); "fail-closed" refuses to proceed without a
 *      successful check (duplicates stay at zero, but availability
 *      visibly drops — queued/rejected requests, lower success rate).
 *
 * A third, independent correctness failure mode is modeled on key scope:
 * "too-broad" collapses genuinely distinct requests onto the same key,
 * so the store wrongly treats a second legitimate request as a duplicate
 * and SUPPRESSES its side effect — a different, equally real integrity
 * violation (silently dropped work) from over-duplication, tracked via
 * duplicationSafetyStatus === "unsafe-suppressing".
 *
 * Required traps:
 *   - Raising worker concurrency alone increases throughput (looks
 *     healthier) but does nothing to repair the broken dedup check —
 *     more workers independently miss the same broken check, so
 *     duplicates climb FASTER, not slower.
 *   - Aggressive retry while the store is degraded/unreachable and the
 *     worker is fail-open gives the broken check more chances to miss
 *     the same request, amplifying duplicate production.
 *   - replicated storage mode alone, without fixing TTL/scope/fail
 *     behavior, prevents the unreachability escalation but does NOT by
 *     itself stop eviction-driven or scope-driven duplicates.
 */
export const idempotencyFailureRules: Rule[] = [
  // ── Optimal recovery: replicated storage (no unreachability
  // escalation to fail over from), a real TTL wider than any realistic
  // retry horizon, request-scoped keys (neither collapsing distinct
  // requests nor failing to recognize true retries), and fail-closed
  // behavior as the last line of defense if the store is ever
  // unreachable regardless. Checked first/most specific so it wins over
  // every other control combination once all four are genuinely in
  // effect.
  {
    id: "replicated-ttl-scoped-failclosed-safe",
    when: {
      triggerEquals: { storeDegrading: true },
      controlEquals: {
        [STORAGE_MODE_KEY]: "replicated",
        [KEY_SCOPE_KEY]: "request-scoped",
        [STORE_UNAVAILABLE_BEHAVIOR_KEY]: "fail-closed",
      },
      controlAtLeast: { [KEY_TTL_SECONDS_KEY]: 300 },
    },
    incidentState: "deduplicated",
    values: {
      duplicateSideEffectCount: 0,
      idempotencyStoreHealth: "normal",
      retryCountPerMin: 10,
      requestSuccessRatePct: 99.4,
      externalSideEffectRatePerMin: 400,
      duplicationSafetyStatus: "safe",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful trap #2 (most specific — checked first among the
  // fail-open traps): worker concurrency scaled up a lot while the
  // store is unreachable and fail-open. Throughput looks even healthier,
  // but every one of the many concurrent workers independently proceeds
  // with no idempotency check — duplicates climb FASTER than the
  // unscaled fail-open baseline below, not slower. This is the explicit
  // required trap: looks like it's helping while duplicates accumulate
  // fastest of any reachable state.
  {
    id: "scaled-concurrency-failopen-unreachable-harmful",
    when: {
      triggerEquals: { storeDegrading: true, storeUnreachable: true },
      controlAtLeast: { [WORKER_CONCURRENCY_KEY]: 16 },
      controlEquals: { [STORE_UNAVAILABLE_BEHAVIOR_KEY]: "fail-open" },
    },
    incidentState: "wasted-scaling-failopen",
    values: {
      duplicateSideEffectCount: 160,
      idempotencyStoreHealth: "critical",
      retryCountPerMin: 20,
      requestSuccessRatePct: 99.8,
      externalSideEffectRatePerMin: 820,
      duplicationSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: lookingHealthyButUnsafeHealth,
  },

  // ── Harmful trap #1, amplified: aggressive retry on top of
  // fail-open-while-unreachable (checked before the plain fail-open
  // fallback below, since it is the more specific match). Every extra
  // retry attempt is another chance for the (nonexistent, during the
  // outage) check to miss the same request, so duplicates compound
  // noticeably faster than the backoff-strategy version of the same
  // fail-open trap.
  {
    id: "unreachable-failopen-aggressive-retry-worse",
    when: {
      triggerEquals: { storeDegrading: true, storeUnreachable: true },
      controlEquals: {
        [STORAGE_MODE_KEY]: "single-node",
        [STORE_UNAVAILABLE_BEHAVIOR_KEY]: "fail-open",
        [RETRY_STRATEGY_KEY]: "aggressive",
      },
    },
    incidentState: "failopen-duplicating-amplified",
    values: {
      duplicateSideEffectCount: 95,
      idempotencyStoreHealth: "critical",
      retryCountPerMin: 60,
      requestSuccessRatePct: 99.7,
      externalSideEffectRatePerMin: 470,
      duplicationSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: lookingHealthyButUnsafeHealth,
  },

  // ── Harmful trap #1 (explicit product requirement, plain fallback):
  // the store is unreachable (second wave) and the worker is set to
  // fail-open, with neither the concurrency nor aggressive-retry
  // amplifiers in effect. Request success rate and side-effect
  // throughput look healthy — even slightly elevated, since nothing is
  // being rejected or queued — but every request processed with no
  // idempotency check behind it is a chance to re-run an already-applied
  // side effect. Duplicate count climbs steadily even though every
  // visible availability metric looks fine.
  {
    id: "unreachable-failopen-unsafe",
    when: {
      triggerEquals: { storeDegrading: true, storeUnreachable: true },
      controlEquals: {
        [STORAGE_MODE_KEY]: "single-node",
        [STORE_UNAVAILABLE_BEHAVIOR_KEY]: "fail-open",
      },
    },
    incidentState: "failopen-duplicating",
    values: {
      duplicateSideEffectCount: 48,
      idempotencyStoreHealth: "critical",
      retryCountPerMin: 15,
      requestSuccessRatePct: 99.6,
      externalSideEffectRatePerMin: 430,
      duplicationSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: lookingHealthyButUnsafeHealth,
  },

  // ── Fail-closed under unreachability: correctly prevents duplicates
  // (duplicateSideEffectCount stays at 0) but costs real, visible
  // availability — requests are rejected/queued rather than proceeding
  // unchecked, so requestSuccessRatePct drops and externalSideEffectRatePerMin
  // falls well below baseline. This is the scenario's binding tradeoff:
  // correctness held at a real availability cost, not a free lunch.
  {
    id: "unreachable-failclosed-safe-but-degraded-availability",
    when: {
      triggerEquals: { storeDegrading: true, storeUnreachable: true },
      controlEquals: {
        [STORAGE_MODE_KEY]: "single-node",
        [STORE_UNAVAILABLE_BEHAVIOR_KEY]: "fail-closed",
      },
    },
    incidentState: "failclosed-degraded-availability",
    values: {
      duplicateSideEffectCount: 0,
      idempotencyStoreHealth: "critical",
      retryCountPerMin: 40,
      requestSuccessRatePct: 71,
      externalSideEffectRatePerMin: 180,
      duplicationSafetyStatus: "safe",
    },
    componentHealth: failClosedDegradedHealth,
  },

  // ── Harmful: key scope set too broad. Genuinely distinct requests
  // collapse onto the same idempotency key, so the store wrongly treats
  // a second legitimate request as a duplicate and suppresses its side
  // effect — a different, equally real integrity violation (silently
  // dropped work rather than over-duplication). duplicateSideEffectCount
  // itself stays near zero (nothing is being re-run), which is precisely
  // the trap: a candidate watching only that one counter would wrongly
  // conclude this state is safe.
  {
    id: "key-scope-too-broad-suppressing",
    when: {
      triggerEquals: { storeDegrading: true },
      controlEquals: { [KEY_SCOPE_KEY]: "too-broad" },
    },
    incidentState: "scope-too-broad-suppressing",
    values: {
      duplicateSideEffectCount: 2,
      idempotencyStoreHealth: "warning",
      retryCountPerMin: 14,
      requestSuccessRatePct: 92,
      externalSideEffectRatePerMin: 260,
      duplicationSafetyStatus: "unsafe-suppressing",
    },
    componentHealth: storeDegradedHealth,
  },

  // ── Harmful: key TTL too short while the store is otherwise reachable.
  // A legitimate retry of the same logical request can arrive after the
  // original key's record has already been evicted, so it looks, to the
  // store, like a brand-new request — duplicates accrue steadily even
  // though the store has not gone fully unreachable yet. This is
  // reachable at the FIRST wave already (storeDegrading alone), proving
  // eviction is an independent root cause from unreachability.
  {
    id: "short-ttl-eviction-duplicating",
    when: {
      triggerEquals: { storeDegrading: true },
      controlAtMost: { [KEY_TTL_SECONDS_KEY]: 15 },
      controlEquals: { [KEY_SCOPE_KEY]: "too-narrow" },
    },
    incidentState: "ttl-eviction-duplicating",
    values: {
      duplicateSideEffectCount: 22,
      idempotencyStoreHealth: "warning",
      retryCountPerMin: 26,
      requestSuccessRatePct: 98,
      externalSideEffectRatePerMin: 410,
      duplicationSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: storeDegradedHealth,
  },

  // ── Second-wave baseline: store has escalated to unreachable, no
  // mitigation has matched (fail-open is the control's default initial
  // value, so doing nothing leaves the worker proceeding unchecked).
  // Only reachable once no mitigation above has matched.
  {
    id: "unreachable-baseline-second-wave",
    when: { triggerEquals: { storeDegrading: true, storeUnreachable: true } },
    incidentState: "unreachable-duplicating",
    values: {
      duplicateSideEffectCount: 70,
      idempotencyStoreHealth: "critical",
      retryCountPerMin: 18,
      requestSuccessRatePct: 99.5,
      externalSideEffectRatePerMin: 440,
      duplicationSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: storeCriticalHealth,
  },

  // ── Baseline degraded: store is degrading (first wave), no mitigation
  // taken yet. Short default TTL (15s) and too-narrow default key scope
  // together are already producing some eviction-driven duplicates even
  // before full unreachability.
  {
    id: "degrading-baseline",
    when: { triggerEquals: { storeDegrading: true } },
    incidentState: "degrading",
    values: {
      duplicateSideEffectCount: 9,
      idempotencyStoreHealth: "warning",
      retryCountPerMin: 16,
      requestSuccessRatePct: 99.2,
      externalSideEffectRatePerMin: 405,
      duplicationSafetyStatus: "unsafe-duplicating",
    },
    componentHealth: storeDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      duplicateSideEffectCount: 0,
      idempotencyStoreHealth: "normal",
      retryCountPerMin: 12,
      requestSuccessRatePct: 99.5,
      externalSideEffectRatePerMin: 400,
      duplicationSafetyStatus: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
