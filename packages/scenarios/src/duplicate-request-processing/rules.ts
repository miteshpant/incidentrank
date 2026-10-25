import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  "api-gateway": "healthy",
  service: "healthy",
  database: "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  "api-gateway": "degraded",
  service: "degraded",
  database: "degraded",
};

// The core trap snapshot: client/gateway-facing metrics can look fine or
// even "successful" (the request eventually gets a response), while the
// database/side-effect component is the one that is actually unsafe.
const lookingOkButUnsafeHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  "api-gateway": "healthy",
  service: "healthy",
  database: "critical",
};

const criticalHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  "api-gateway": "critical",
  service: "critical",
  database: "critical",
};

/**
 * Authored rule table for Duplicate Request Processing, ordered
 * most-specific-first. A downstream dependency slows down; the service's
 * response times rise; the CLIENT's own timeout fires before the
 * original response returns, so the client cannot tell whether its first
 * attempt actually succeeded — it retries. The API GATEWAY independently
 * retries on a slow/5xx response too. Without the service recognizing a
 * retried request's identity before executing its side effect, each
 * arriving copy creates another order. This is a request-level/
 * client-retry-ambiguity problem (HTTP idempotency-key pattern) —
 * genuinely distinct from Duplicate Event Processing's broker-redelivery
 * mechanism: there is no broker here, no consumer acknowledgement to a
 * message queue, and no redelivery count. The ambiguity is entirely at
 * the HTTP request/response boundary between client and service.
 *
 * Two required traps (explicit product requirement — "correctness
 * matters more than apparent throughput"):
 *   - Shortening the client timeout while the dependency is already slow
 *     makes the client give up and retry sooner, against requests that
 *     have not actually failed yet — MORE duplicate side effects, not
 *     fewer, even though customer-facing latency looks "more responsive."
 *   - Raising the client retry count "to ensure the request eventually
 *     succeeds" produces more copies of the same logical request reaching
 *     the service — MORE duplicates, even though apparent request success
 *     rate improves.
 *
 * The only genuinely safe path is enforcing idempotency-key checking
 * (service recognizes and skips a retried request's side effect) backed
 * by atomic check-and-record so a race between two near-simultaneous
 * retries cannot let both through. That combination holds at zero
 * duplicates regardless of how aggressively the client or gateway retry.
 */
export const duplicateRequestProcessingRules: Rule[] = [
  // ── Optimal recovery: idempotency key handling enforced WITH atomic
  // transaction handling. A retried copy of an already-applied request
  // is recognized and its side effect skipped, and the check-and-record
  // step cannot race against itself, so duplicate side effects hold at
  // zero regardless of client retry count, client timeout, or gateway
  // retry behavior. Checked first/most specific so it wins over every
  // other control combination once both are genuinely in effect.
  {
    id: "enforced-atomic-safe",
    when: {
      triggerEquals: { dependencySlow: true },
      controlEquals: {
        [IDEMPOTENCY_KEY_HANDLING_KEY]: "enforced",
        [TRANSACTION_HANDLING_KEY]: "atomic",
      },
    },
    incidentState: "deduplicated",
    values: {
      serviceLatencyMs: 260,
      duplicateRequestRatePct: 0,
      retryVolumePerMin: 30,
      sideEffectCount: 100,
      idempotencyHitRatePct: 96,
      customerErrorRatePct: 1,
      serviceStatus: "normal",
      duplicateSideEffectStatus: "deduplicated",
    },
    componentHealth: healthyHealth,
  },

  // ── Harmful trap #1 (explicit product requirement), second wave: the
  // client timeout has been shortened aggressively while the dependency
  // is still slow and idempotency is not enforced. The client gives up
  // and retries BEFORE the original, still-in-flight request's response
  // (and its already-executed side effect) can return — so duplicate
  // side effects compound FASTER under sustained pressure than the
  // unmitigated baseline, even though customer-visible latency looks
  // improved.
  {
    id: "shortened-timeout-amplifies-duplicates-second-wave",
    when: {
      triggerEquals: { dependencySlow: true, sustainedRetryPressure: true },
      controlAtMost: { [CLIENT_TIMEOUT_MS_KEY]: 500 },
      controlEquals: { [IDEMPOTENCY_KEY_HANDLING_KEY]: "disabled" },
    },
    incidentState: "timeout-amplified-compounding",
    values: {
      serviceLatencyMs: 2_600,
      duplicateRequestRatePct: 46,
      retryVolumePerMin: 920,
      sideEffectCount: 1_540,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 9,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: lookingOkButUnsafeHealth,
  },
  {
    id: "shortened-timeout-amplifies-duplicates",
    when: {
      triggerEquals: { dependencySlow: true },
      controlAtMost: { [CLIENT_TIMEOUT_MS_KEY]: 500 },
      controlEquals: { [IDEMPOTENCY_KEY_HANDLING_KEY]: "disabled" },
    },
    incidentState: "timeout-amplified",
    values: {
      serviceLatencyMs: 2_200,
      duplicateRequestRatePct: 34,
      retryVolumePerMin: 640,
      sideEffectCount: 460,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 7,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: lookingOkButUnsafeHealth,
  },

  // ── Harmful trap #2 (explicit product requirement), second wave:
  // client retry count raised high "to ensure the request eventually
  // succeeds" while idempotency is not enforced. Every additional retry
  // is another copy of the same logical request reaching the service —
  // duplicate side effects compound faster than the unmitigated
  // baseline, even though apparent request success rate looks better.
  {
    id: "raised-retry-count-amplifies-duplicates-second-wave",
    when: {
      triggerEquals: { dependencySlow: true, sustainedRetryPressure: true },
      controlAtLeast: { [CLIENT_RETRY_COUNT_KEY]: 10 },
      controlEquals: { [IDEMPOTENCY_KEY_HANDLING_KEY]: "disabled" },
    },
    incidentState: "retry-count-amplified-compounding",
    values: {
      serviceLatencyMs: 2_900,
      duplicateRequestRatePct: 52,
      retryVolumePerMin: 1_050,
      sideEffectCount: 1_780,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 10,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: lookingOkButUnsafeHealth,
  },
  {
    id: "raised-retry-count-amplifies-duplicates",
    when: {
      triggerEquals: { dependencySlow: true },
      controlAtLeast: { [CLIENT_RETRY_COUNT_KEY]: 10 },
      controlEquals: { [IDEMPOTENCY_KEY_HANDLING_KEY]: "disabled" },
    },
    incidentState: "retry-count-amplified",
    values: {
      serviceLatencyMs: 2_400,
      duplicateRequestRatePct: 38,
      retryVolumePerMin: 720,
      sideEffectCount: 520,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 8,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: lookingOkButUnsafeHealth,
  },

  // ── Partial, still unsafe: idempotency key handling is "enforced"
  // (the service checks keys) but transaction handling is still "none"
  // — the check-then-act sequence is two separate steps, so two
  // near-simultaneous retries of the same request can both pass the key
  // check before either has recorded it, and both execute the side
  // effect. Duplicates drop sharply versus the unmitigated baseline
  // (most sequential retries are now caught) but do not reach zero —
  // the structural race remains.
  {
    id: "enforced-without-atomic-partial",
    when: {
      triggerEquals: { dependencySlow: true },
      controlEquals: {
        [IDEMPOTENCY_KEY_HANDLING_KEY]: "enforced",
        [TRANSACTION_HANDLING_KEY]: "none",
      },
    },
    incidentState: "enforced-without-atomic",
    values: {
      serviceLatencyMs: 310,
      duplicateRequestRatePct: 6,
      retryVolumePerMin: 150,
      sideEffectCount: 118,
      idempotencyHitRatePct: 70,
      customerErrorRatePct: 2,
      serviceStatus: "warning",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial, still unsafe: idempotency key handling is "logged-only"
  // — the service records and reports the key but does not use it to
  // skip the side effect. Visibility improves (idempotencyHitRatePct
  // reports nonzero matches) but every one of those matched retries
  // still executes its side effect, so duplicate counts do not improve
  // over the unmitigated baseline.
  {
    id: "logged-only-no-protection",
    when: {
      triggerEquals: { dependencySlow: true },
      controlEquals: { [IDEMPOTENCY_KEY_HANDLING_KEY]: "logged-only" },
    },
    incidentState: "logged-only",
    values: {
      serviceLatencyMs: 1_900,
      duplicateRequestRatePct: 24,
      retryVolumePerMin: 340,
      sideEffectCount: 240,
      idempotencyHitRatePct: 58,
      customerErrorRatePct: 5,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: lookingOkButUnsafeHealth,
  },

  // ── Partial, still unsafe: a request-deduplication window is set at
  // the gateway without idempotency enforced at the service. Retries
  // that arrive while the window is still open get coalesced, giving
  // real relief, but any retry that arrives after the window closes (the
  // client's later retries, or a retry the gateway itself produces after
  // the window elapses) is forwarded as a fresh request and still
  // executes its side effect — the underlying cause (no check at the
  // point the side effect runs) is not addressed.
  {
    id: "dedup-window-only-partial",
    when: {
      triggerEquals: { dependencySlow: true },
      controlAtLeast: { [REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY]: 10 },
      controlEquals: { [IDEMPOTENCY_KEY_HANDLING_KEY]: "disabled" },
    },
    incidentState: "dedup-window-only",
    values: {
      serviceLatencyMs: 1_700,
      duplicateRequestRatePct: 16,
      retryVolumePerMin: 300,
      sideEffectCount: 196,
      idempotencyHitRatePct: 40,
      customerErrorRatePct: 4,
      serviceStatus: "warning",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: degradedHealth,
  },

  // ── Harmful (not gated to a specific control value above): gateway
  // retry enabled on top of client retries, with idempotency not
  // enforced, compounds duplication from two independent sources — the
  // gateway can produce its own extra copy of a request regardless of
  // what the client is doing. Only reachable once no other, more
  // specific mitigation/trap above has matched.
  {
    id: "gateway-and-client-retry-compounding",
    when: {
      triggerEquals: { dependencySlow: true, sustainedRetryPressure: true },
      controlEquals: {
        [GATEWAY_RETRY_ENABLED_KEY]: true,
        [IDEMPOTENCY_KEY_HANDLING_KEY]: "disabled",
      },
    },
    incidentState: "sustained-ambiguous-ack",
    values: {
      serviceLatencyMs: 2_100,
      duplicateRequestRatePct: 29,
      retryVolumePerMin: 520,
      sideEffectCount: 360,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 6,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: dependency slow, no mitigation taken yet.
  // Client retries fire on its own timeout; gateway retries fire
  // independently on slow/5xx responses; neither the client nor the
  // gateway nor the service can distinguish a retry from a fresh
  // request, so every retry's side effect is applied again.
  {
    id: "baseline-ambiguous-ack",
    when: { triggerEquals: { dependencySlow: true } },
    incidentState: "baseline-ambiguous-ack",
    values: {
      serviceLatencyMs: 1_800,
      duplicateRequestRatePct: 18,
      retryVolumePerMin: 220,
      sideEffectCount: 150,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 4,
      serviceStatus: "critical",
      duplicateSideEffectStatus: "duplicating",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      serviceLatencyMs: 220,
      duplicateRequestRatePct: 0,
      retryVolumePerMin: 4,
      sideEffectCount: 100,
      idempotencyHitRatePct: 0,
      customerErrorRatePct: 0,
      serviceStatus: "normal",
      duplicateSideEffectStatus: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
