import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  A_TO_B_TIMEOUT_MS_KEY,
  API_TO_A_TIMEOUT_MS_KEY,
  B_TO_C_RETRY_COUNT_KEY,
  B_TO_C_TIMEOUT_MS_KEY,
  CIRCUIT_BREAKER_B_TO_C_KEY,
  SERVICE_A_CONCURRENCY_LIMIT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
};

const breakerOpenHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "degraded",
};

const bulkheadPartialHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "degraded",
  "service-a": "degraded",
  "service-b": "critical",
  "service-c": "critical",
};

const bToCFixedRetryStressHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "degraded",
  "service-a": "degraded",
  "service-b": "healthy",
  "service-c": "critical",
};

const cascadingCriticalHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "critical",
  "service-a": "critical",
  "service-b": "critical",
  "service-c": "critical",
};

const failFastWastedWorkHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  api: "critical",
  "service-a": "critical",
  "service-b": "critical",
  "service-c": "critical",
};

/**
 * Authored rule table for Dependency Timeout Cascade, ordered
 * most-specific-first. Service C (the deepest dependency) has slowed
 * down. The candidate must reason about the full timeout BUDGET across
 * four hops at once, not tune any single hop in isolation:
 *
 *   apiToATimeoutMs  >  aToBTimeoutMs  >  bToCTimeoutMs
 *
 * each with enough headroom that an upstream hop's timeout never fires
 * before the hop it depends on has had a chance to fail fast on its own.
 * Fixing only the bToC hop relieves Service B's own pool but, if retries
 * against the still-slow C stay on, transfers pressure onto Service C's
 * own inbound connection capacity (retry amplification) — the scenario's
 * central multi-system pressure-transfer. The circuit breaker is a
 * structurally different, also-valid mitigation: it stops calling C
 * altogether rather than re-tuning any timeout value.
 */
export const dependencyTimeoutCascadeRules: Rule[] = [
  // ── Optimal recovery: the full budget is correctly re-proportioned
  // end-to-end (each hop's timeout meaningfully shorter than the one
  // above it, with headroom) AND retries against the degraded C are
  // reduced to a non-amplifying level. No hop ever blocks for the full
  // duration of C's slowness, so pool utilization and outstanding
  // requests recover at every layer and stay recovered regardless of how
  // long C stays slow. Checked first because it must win over every
  // other control combination once the budget is genuinely fixed.
  {
    id: "budget-reproportioned-recovery",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlAtMost: {
        [B_TO_C_TIMEOUT_MS_KEY]: 800,
        [A_TO_B_TIMEOUT_MS_KEY]: 1_000,
        [API_TO_A_TIMEOUT_MS_KEY]: 1_500,
        [B_TO_C_RETRY_COUNT_KEY]: 1,
      },
    },
    incidentState: "recovered-budgeted",
    values: {
      serviceCLatencyMs: 3_200,
      serviceBLatencyMs: 820,
      serviceALatencyMs: 980,
      apiLatencyMs: 1_120,
      timeoutRatePercent: 4,
      serviceBOutstandingRequests: 22,
      serviceAOutstandingRequests: 20,
      apiOutstandingRequests: 18,
      serviceBPoolUtilization: 18,
      serviceAPoolUtilization: 15,
      apiPoolUtilization: 12,
      serviceCConnectionsInUse: 20,
      customerSuccessRatePercent: 96,
      chainStatus: "normal",
      timeoutBudgetHealth: "budgeted",
    },
    componentHealth: healthyHealth,
  },

  // ── Acceptable recovery, structurally different mechanism: the
  // circuit breaker is tripped on the B->C hop, so Service B fails fast
  // on every call into C instead of waiting out any timeout at all.
  // Every pool upstream (B, A, API) recovers because none of them ever
  // blocks on C again — but the capability C provides is unavailable for
  // as long as the breaker stays open, visible as a real but bounded
  // customerSuccessRatePercent dip (not a full fix of the underlying
  // budget, a deliberate fence instead).
  {
    id: "circuit-breaker-open-recovery",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlEquals: { [CIRCUIT_BREAKER_B_TO_C_KEY]: true },
    },
    incidentState: "breaker-open",
    values: {
      serviceCLatencyMs: 3_200,
      serviceBLatencyMs: 40,
      serviceALatencyMs: 90,
      apiLatencyMs: 140,
      timeoutRatePercent: 0,
      serviceBOutstandingRequests: 20,
      serviceAOutstandingRequests: 20,
      apiOutstandingRequests: 20,
      serviceBPoolUtilization: 12,
      serviceAPoolUtilization: 11,
      apiPoolUtilization: 10,
      serviceCConnectionsInUse: 15,
      customerSuccessRatePercent: 88,
      chainStatus: "warning",
      timeoutBudgetHealth: "masked",
    },
    componentHealth: breakerOpenHealth,
  },

  // ── Centerpiece pressure-transfer, still degraded: the B->C hop alone
  // is tightened to a sane budget (B no longer blocks on C for long), so
  // Service B's own latency/pool/outstanding-requests genuinely recover.
  // But retries against C are still active (not reduced), so B keeps
  // re-issuing calls against the still-slow C — the retry volume now
  // lands on Service C's own inbound connection capacity instead of
  // Service B's pool. The primary symptom (B's exhaustion) is relieved;
  // a second, distinct subsystem (C's own connection headroom) becomes
  // the visibly constrained one. Checked before the general
  // retry-amplification trap below because it is strictly more specific
  // (it additionally requires the B->C timeout to already be tightened).
  {
    id: "b-to-c-timeout-fixed-alone-stresses-c-connections",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlAtMost: { [B_TO_C_TIMEOUT_MS_KEY]: 800 },
      controlAtLeast: { [B_TO_C_RETRY_COUNT_KEY]: 3 },
      controlEquals: { [CIRCUIT_BREAKER_B_TO_C_KEY]: false },
    },
    incidentState: "b-relieved-c-connections-stressed",
    values: {
      serviceCLatencyMs: 3_400,
      serviceBLatencyMs: 780,
      serviceALatencyMs: 5_200,
      apiLatencyMs: 5_400,
      timeoutRatePercent: 34,
      serviceBOutstandingRequests: 40,
      serviceAOutstandingRequests: 230,
      apiOutstandingRequests: 210,
      serviceBPoolUtilization: 22,
      serviceAPoolUtilization: 94,
      apiPoolUtilization: 88,
      serviceCConnectionsInUse: 95,
      customerSuccessRatePercent: 31,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: bToCFixedRetryStressHealth,
  },

  // ── Harmful: retries against Service C raised while C is degraded,
  // and the B->C timeout itself was never tightened either. Each retry
  // multiplies the request volume C has to serve without C getting any
  // faster, pushing serviceCConnectionsInUse and every downstream
  // latency number higher — and, unlike the baseline, customer success
  // rate is driven even lower because so much more of the chain's
  // effective capacity is burned on repeat calls to the same slow
  // dependency.
  {
    id: "raised-retries-amplify-load-on-c",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlAtLeast: { [B_TO_C_RETRY_COUNT_KEY]: 3 },
      controlEquals: { [CIRCUIT_BREAKER_B_TO_C_KEY]: false },
    },
    incidentState: "retry-amplified",
    values: {
      serviceCLatencyMs: 4_800,
      serviceBLatencyMs: 9_600,
      serviceALatencyMs: 9_800,
      apiLatencyMs: 9_900,
      timeoutRatePercent: 71,
      serviceBOutstandingRequests: 310,
      serviceAOutstandingRequests: 180,
      apiOutstandingRequests: 150,
      serviceBPoolUtilization: 99,
      serviceAPoolUtilization: 92,
      apiPoolUtilization: 85,
      serviceCConnectionsInUse: 98,
      customerSuccessRatePercent: 7,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: cascadingCriticalHealth,
  },

  // ── Harmful: the API's own timeout to Service A is slashed while the
  // hops below it are untouched. Requests now fail fast at the API edge
  // (customer sees an error quickly instead of a hang), but Service A,
  // B, and C still receive and keep working the exact same abandoned
  // request for the duration of THEIR OWN timeouts — resources are
  // consumed for work whose caller has already given up. Customer
  // success rate drops further, not less, than the unmitigated baseline.
  {
    id: "top-of-chain-timeout-cut-wastes-downstream-work",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlAtMost: { [API_TO_A_TIMEOUT_MS_KEY]: 1_500, [B_TO_C_RETRY_COUNT_KEY]: 1 },
      controlAtLeast: { [B_TO_C_TIMEOUT_MS_KEY]: 5_000 },
    },
    incidentState: "fail-fast-wasted-work",
    values: {
      serviceCLatencyMs: 3_200,
      serviceBLatencyMs: 5_100,
      serviceALatencyMs: 5_300,
      apiLatencyMs: 1_480,
      timeoutRatePercent: 91,
      serviceBOutstandingRequests: 260,
      serviceAOutstandingRequests: 240,
      apiOutstandingRequests: 60,
      serviceBPoolUtilization: 97,
      serviceAPoolUtilization: 95,
      apiPoolUtilization: 40,
      serviceCConnectionsInUse: 80,
      customerSuccessRatePercent: 9,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: failFastWastedWorkHealth,
  },

  // ── Partial, still degraded: both the B->C timeout AND retries are
  // tightened together (the correct local fix for that one hop, and
  // retries no longer amplify), but the hops above it (A->B, API->A)
  // still carry their original long budgets. Service B itself recovers
  // cleanly, but Service A's own pool is still sized around calls to B
  // taking far longer than B now actually needs — A's pool stays
  // elevated purely from its own oversized timeout budget, so the
  // candidate has not yet finished re-proportioning the chain.
  {
    id: "b-to-c-fixed-upstream-budget-still-misaligned",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlAtMost: { [B_TO_C_TIMEOUT_MS_KEY]: 800, [B_TO_C_RETRY_COUNT_KEY]: 1 },
      controlAtLeast: { [A_TO_B_TIMEOUT_MS_KEY]: 6_000 },
    },
    incidentState: "b-fixed-a-budget-misaligned",
    values: {
      serviceCLatencyMs: 3_300,
      serviceBLatencyMs: 760,
      serviceALatencyMs: 5_900,
      apiLatencyMs: 6_050,
      timeoutRatePercent: 21,
      serviceBOutstandingRequests: 25,
      serviceAOutstandingRequests: 190,
      apiOutstandingRequests: 170,
      serviceBPoolUtilization: 19,
      serviceAPoolUtilization: 86,
      apiPoolUtilization: 78,
      serviceCConnectionsInUse: 24,
      customerSuccessRatePercent: 48,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: bulkheadPartialHealth,
  },

  // ── Partial mitigation: Service A's own concurrency limit (bulkhead)
  // is tightened. This caps how many of A's threads can ever be
  // simultaneously blocked on the slow chain below it, protecting A's
  // own pool (and therefore the API's pool calling A) independent of any
  // timeout value — but Service B is still blocking on the degraded C,
  // and the capped concurrency now shows up as outright rejections
  // rather than resolving the underlying slow call.
  {
    id: "bulkhead-caps-a-but-b-still-blocked-on-c",
    when: {
      triggerEquals: { serviceCDegraded: true },
      controlAtMost: { [SERVICE_A_CONCURRENCY_LIMIT_KEY]: 80 },
      controlAtLeast: { [B_TO_C_TIMEOUT_MS_KEY]: 5_000 },
    },
    incidentState: "bulkhead-partial",
    values: {
      serviceCLatencyMs: 3_300,
      serviceBLatencyMs: 5_200,
      serviceALatencyMs: 5_400,
      apiLatencyMs: 1_900,
      timeoutRatePercent: 46,
      serviceBOutstandingRequests: 180,
      serviceAOutstandingRequests: 78,
      apiOutstandingRequests: 60,
      serviceBPoolUtilization: 90,
      serviceAPoolUtilization: 42,
      apiPoolUtilization: 35,
      serviceCConnectionsInUse: 55,
      customerSuccessRatePercent: 58,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: bulkheadPartialHealth,
  },

  // ── Second wave, baseline: sustained unmitigated retries against the
  // degraded C finally saturate C's own inbound connection pool,
  // deepening the already-visible serviceCConnectionsInUse climb. Only
  // reachable once no mitigation above has matched.
  {
    id: "retry-saturation-baseline",
    when: {
      triggerEquals: { serviceCDegraded: true, retryAmplificationSaturating: true },
    },
    incidentState: "cascading-saturated",
    values: {
      serviceCLatencyMs: 5_200,
      serviceBLatencyMs: 9_900,
      serviceALatencyMs: 9_950,
      apiLatencyMs: 9_980,
      timeoutRatePercent: 73,
      serviceBOutstandingRequests: 340,
      serviceAOutstandingRequests: 300,
      apiOutstandingRequests: 260,
      serviceBPoolUtilization: 99,
      serviceAPoolUtilization: 98,
      apiPoolUtilization: 95,
      serviceCConnectionsInUse: 100,
      customerSuccessRatePercent: 6,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: cascadingCriticalHealth,
  },

  // ── Baseline critical: Service C has degraded and the candidate has
  // taken no meaningfully mitigating action yet. Each hop's long,
  // unaligned timeout means threads/connections block for the full
  // duration of C's slowness and the exhaustion compounds upward.
  {
    id: "cascading-exhaustion-baseline",
    when: { triggerEquals: { serviceCDegraded: true } },
    incidentState: "cascading",
    values: {
      serviceCLatencyMs: 4_600,
      serviceBLatencyMs: 8_800,
      serviceALatencyMs: 8_950,
      apiLatencyMs: 8_990,
      timeoutRatePercent: 62,
      serviceBOutstandingRequests: 260,
      serviceAOutstandingRequests: 230,
      apiOutstandingRequests: 200,
      serviceBPoolUtilization: 96,
      serviceAPoolUtilization: 93,
      apiPoolUtilization: 88,
      serviceCConnectionsInUse: 70,
      customerSuccessRatePercent: 14,
      chainStatus: "critical",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: cascadingCriticalHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      serviceCLatencyMs: 80,
      serviceBLatencyMs: 110,
      serviceALatencyMs: 140,
      apiLatencyMs: 170,
      timeoutRatePercent: 0,
      serviceBOutstandingRequests: 20,
      serviceAOutstandingRequests: 20,
      apiOutstandingRequests: 20,
      serviceBPoolUtilization: 10,
      serviceAPoolUtilization: 10,
      apiPoolUtilization: 10,
      serviceCConnectionsInUse: 15,
      customerSuccessRatePercent: 100,
      chainStatus: "normal",
      timeoutBudgetHealth: "unresolved",
    },
    componentHealth: healthyHealth,
  },
];
