import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  B_TO_DEPENDENCY_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY,
  GATEWAY_RETRY_COUNT_KEY,
  GATEWAY_TO_A_TIMEOUT_MS_KEY,
  REQUEST_CANCELLATION_ENABLED_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  dependency: "healthy",
};

const breakerFencedHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  dependency: "degraded",
};

const budgetedCancelOffHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "degraded",
  "service-a": "degraded",
  "service-b": "degraded",
  dependency: "degraded",
};

const cancelOnBudgetMisalignedHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "degraded",
  "service-a": "degraded",
  "service-b": "healthy",
  dependency: "degraded",
};

const criticalHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "critical",
  "service-a": "critical",
  "service-b": "critical",
  dependency: "degraded",
};

const innerAloneCriticalHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "critical",
  "service-a": "critical",
  "service-b": "healthy",
  dependency: "degraded",
};

/**
 * Authored rule table for Request Timeout Cascade, ordered
 * most-specific-first. The Dependency has a latency blip. The incident's
 * real engine is NOT the blip itself (it is bounded and does not keep
 * worsening on its own) — it is that the Gateway retries on timeout
 * without cancelling the original call chain, so every retry adds a
 * brand-new in-flight chain through Service A/B/Dependency on top of the
 * old, abandoned one that keeps silently consuming threads/connections
 * below. The candidate must reason about TWO orthogonal requirements at
 * once:
 *
 *   1. timeout budget ordering across three hops:
 *        gatewayToATimeoutMs > aToBTimeoutMs > bToDependencyTimeoutMs
 *      (each meaningfully shorter than the one above it, with headroom),
 *      so no hop ever blocks waiting on a chain still retrying beneath it
 *   2. requestCancellationEnabled, so a caller giving up actually frees
 *      the abandoned work downstream instead of letting it run on
 *
 * Fixing only #1 (the lesson Dependency Timeout Cascade already tests)
 * is NOT sufficient here: even a perfectly reproportioned budget doesn't
 * free an already-abandoned chain if cancellation is off, so retried
 * in-flight work still accumulates — just more slowly. Fixing only #2
 * without #1 frees abandoned work promptly but each individual request
 * still takes as long as the oversized outer budget allows before it is
 * even abandoned, so customer latency stays unacceptable. Both are
 * required together for a durable recovery. The circuit breaker is a
 * structurally different, also-valid mitigation: it stops calling the
 * Dependency altogether rather than re-tuning any timeout/cancellation
 * behavior.
 */
export const requestTimeoutCascadeRules: Rule[] = [
  // ── Optimal recovery: the full budget is correctly re-proportioned
  // end-to-end AND cancellation is enabled, so retries no longer leave
  // abandoned work behind and no hop ever blocks on a chain already
  // being retried beneath it. In-flight counts, connection utilization,
  // and customer latency all recover and stay recovered regardless of
  // how long the blip itself persists. Checked first because it must
  // win over every other control combination once both halves of the
  // fix are in place.
  {
    id: "budget-and-cancellation-recovery",
    when: {
      triggerEquals: { dependencyBlip: true },
      controlAtMost: {
        [B_TO_DEPENDENCY_TIMEOUT_MS_KEY]: 900,
        [A_TO_B_TIMEOUT_MS_KEY]: 1_200,
        [GATEWAY_TO_A_TIMEOUT_MS_KEY]: 1_800,
      },
      controlEquals: { [REQUEST_CANCELLATION_ENABLED_KEY]: true },
    },
    incidentState: "recovered-rebudgeted",
    values: {
      dependencyLatencyMs: 1_100,
      timeoutRateByLayerPercent: 3,
      inFlightRequests: 46,
      abandonedInFlightRequests: 0,
      connectionUtilizationPercent: 16,
      retryVolumePerSecond: 3,
      customerLatencyMs: 1_350,
      customerSuccessRatePercent: 97,
      chainStatus: "normal",
      timeoutBudgetHealth: "rebudgeted",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable recovery, structurally different mechanism: the
  // circuit breaker on the B->Dependency hop is tripped, so Service B
  // fails fast on every call into the Dependency instead of waiting out
  // any timeout or retrying at all. Every pool/latency metric upstream
  // (A, Gateway) recovers because nothing ever blocks on the Dependency
  // again — but the capability the Dependency provides is unavailable
  // for as long as the breaker stays open, visible as a real but bounded
  // customerSuccessRatePercent dip (fencing the dependency off, not
  // fixing the budget).
  {
    id: "circuit-breaker-fenced-recovery",
    when: {
      triggerEquals: { dependencyBlip: true },
      controlEquals: { [CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY]: true },
    },
    incidentState: "fenced",
    values: {
      dependencyLatencyMs: 1_100,
      timeoutRateByLayerPercent: 0,
      inFlightRequests: 42,
      abandonedInFlightRequests: 0,
      connectionUtilizationPercent: 14,
      retryVolumePerSecond: 0,
      customerLatencyMs: 190,
      customerSuccessRatePercent: 89,
      chainStatus: "warning",
      timeoutBudgetHealth: "fenced",
    },
    componentHealth: breakerFencedHealth,
  },

  // ── Centerpiece distinguishing state, still degraded: the timeout
  // budget IS correctly re-proportioned end-to-end, but cancellation is
  // still off. No hop blocks waiting on a chain retrying beneath it
  // anymore (so the oversized-waiting problem is gone), but every
  // Gateway-level retry still leaves its original, now-abandoned chain
  // running to completion at Service A/B/Dependency — abandoned in-flight
  // work keeps accumulating, just more slowly than before, because
  // nothing ever cancels it. This is the scenario's central lesson:
  // correct budget ordering alone (the fix Dependency Timeout Cascade
  // rewards) is NOT sufficient here. Checked before the general baseline
  // because it is strictly more specific.
  {
    id: "budget-fixed-cancellation-off-still-accumulates",
    when: {
      triggerEquals: { dependencyBlip: true },
      controlAtMost: {
        [B_TO_DEPENDENCY_TIMEOUT_MS_KEY]: 900,
        [A_TO_B_TIMEOUT_MS_KEY]: 1_200,
        [GATEWAY_TO_A_TIMEOUT_MS_KEY]: 1_800,
      },
      controlEquals: {
        [REQUEST_CANCELLATION_ENABLED_KEY]: false,
        [CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY]: false,
      },
    },
    incidentState: "budgeted-but-accumulating",
    values: {
      dependencyLatencyMs: 1_100,
      timeoutRateByLayerPercent: 22,
      inFlightRequests: 310,
      abandonedInFlightRequests: 260,
      connectionUtilizationPercent: 86,
      retryVolumePerSecond: 48,
      customerLatencyMs: 1_900,
      customerSuccessRatePercent: 52,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: budgetedCancelOffHealth,
  },

  // ── Partial mitigation, still degraded: cancellation IS enabled (
  // abandoned work stops piling up the instant a caller gives up), but
  // the timeout budget is still the original, unproportioned one — the
  // Gateway still waits its full long timeout before giving up on a
  // chain that could have failed fast far sooner. In-flight accumulation
  // is bounded (cancellation is doing its job), but customer latency and
  // timeout rate stay bad because every individual request still takes
  // as long as the oversized outer budget allows before anyone gives up.
  {
    id: "cancellation-on-budget-misaligned-still-slow",
    when: {
      triggerEquals: { dependencyBlip: true },
      controlEquals: { [REQUEST_CANCELLATION_ENABLED_KEY]: true },
      controlAtLeast: {
        [GATEWAY_TO_A_TIMEOUT_MS_KEY]: 9_000,
        [A_TO_B_TIMEOUT_MS_KEY]: 7_000,
      },
    },
    incidentState: "cancellation-on-budget-misaligned",
    values: {
      dependencyLatencyMs: 1_100,
      timeoutRateByLayerPercent: 18,
      inFlightRequests: 80,
      abandonedInFlightRequests: 10,
      connectionUtilizationPercent: 38,
      retryVolumePerSecond: 6,
      customerLatencyMs: 8_800,
      customerSuccessRatePercent: 61,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: cancelOnBudgetMisalignedHealth,
  },

  // ── Harmful: only the innermost hop (B->Dependency) is tightened,
  // while the Gateway and Service A keep their original long budgets and
  // cancellation stays off. Service B's own pool genuinely recovers (it
  // now fails fast against the Dependency), but Service A and the
  // Gateway are still sized around B taking far longer than B now
  // actually needs — their pools stay saturated purely from their own
  // oversized timeout budgets, and abandoned retries from the still-long
  // outer hops keep piling up underneath. The candidate has fixed one
  // hop and declared victory too early.
  {
    id: "inner-hop-fixed-alone-upstream-still-misaligned",
    when: {
      triggerEquals: { dependencyBlip: true },
      controlAtMost: { [B_TO_DEPENDENCY_TIMEOUT_MS_KEY]: 900 },
      controlAtLeast: {
        [A_TO_B_TIMEOUT_MS_KEY]: 7_000,
        [GATEWAY_TO_A_TIMEOUT_MS_KEY]: 9_000,
      },
      controlEquals: {
        [REQUEST_CANCELLATION_ENABLED_KEY]: false,
        [CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY]: false,
      },
    },
    incidentState: "inner-hop-fixed-alone",
    values: {
      dependencyLatencyMs: 1_100,
      timeoutRateByLayerPercent: 29,
      inFlightRequests: 240,
      abandonedInFlightRequests: 190,
      connectionUtilizationPercent: 91,
      retryVolumePerSecond: 40,
      customerLatencyMs: 8_600,
      customerSuccessRatePercent: 34,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: innerAloneCriticalHealth,
  },

  // ── Harmful: Gateway-level retries raised while the budget stays
  // unproportioned and cancellation stays off. Each additional retry
  // starts a brand-new call chain through every layer below while the
  // old, abandoned chains from earlier retries are still running — the
  // in-flight count and connection utilization climb sharply faster than
  // the unmitigated baseline, and customer success rate drops further
  // because so much of the chain's effective capacity is burned on
  // redundant, already-abandoned work.
  {
    id: "raised-gateway-retries-multiply-in-flight-chains",
    when: {
      triggerEquals: { dependencyBlip: true },
      controlAtLeast: { [GATEWAY_RETRY_COUNT_KEY]: 4 },
      controlEquals: {
        [REQUEST_CANCELLATION_ENABLED_KEY]: false,
        [CIRCUIT_BREAKER_B_TO_DEPENDENCY_KEY]: false,
      },
    },
    incidentState: "retry-multiplied",
    values: {
      dependencyLatencyMs: 1_200,
      timeoutRateByLayerPercent: 48,
      inFlightRequests: 620,
      abandonedInFlightRequests: 560,
      connectionUtilizationPercent: 99,
      retryVolumePerSecond: 180,
      customerLatencyMs: 9_600,
      customerSuccessRatePercent: 8,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Second wave, baseline: sustained, uncancelled Gateway retries
  // finally saturate in-flight capacity and connection utilization across
  // every layer, deepening the already-visible accumulation trend. Only
  // reachable once no mitigation above has matched.
  {
    id: "accumulation-saturating-baseline",
    when: {
      triggerEquals: { dependencyBlip: true, accumulationSaturating: true },
    },
    incidentState: "saturated",
    values: {
      dependencyLatencyMs: 1_150,
      timeoutRateByLayerPercent: 41,
      inFlightRequests: 560,
      abandonedInFlightRequests: 480,
      connectionUtilizationPercent: 100,
      retryVolumePerSecond: 90,
      customerLatencyMs: 9_200,
      customerSuccessRatePercent: 9,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: the Dependency has a latency blip and the
  // candidate has taken no meaningfully mitigating action yet. The
  // default Gateway retry (1) with cancellation off and an unproportioned
  // budget means every retry adds a new in-flight chain on top of the
  // old, abandoned one still running beneath it.
  {
    id: "accumulation-baseline",
    when: { triggerEquals: { dependencyBlip: true } },
    incidentState: "accumulating",
    values: {
      dependencyLatencyMs: 1_100,
      timeoutRateByLayerPercent: 30,
      inFlightRequests: 340,
      abandonedInFlightRequests: 280,
      connectionUtilizationPercent: 88,
      retryVolumePerSecond: 50,
      customerLatencyMs: 8_900,
      customerSuccessRatePercent: 22,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      dependencyLatencyMs: 90,
      timeoutRateByLayerPercent: 0,
      inFlightRequests: 40,
      abandonedInFlightRequests: 0,
      connectionUtilizationPercent: 12,
      retryVolumePerSecond: 2,
      customerLatencyMs: 220,
      customerSuccessRatePercent: 100,
      chainStatus: "normal",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
