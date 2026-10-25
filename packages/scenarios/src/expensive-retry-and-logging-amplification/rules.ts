import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  DEPENDENCY_BACKOFF_KEY,
  LOGGING_LEVEL_KEY,
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  RETRY_COUNT_KEY,
  RETRY_OWNERSHIP_KEY,
  SAMPLING_RATE_PERCENT_KEY,
  TELEMETRY_DUPLICATION_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  api: "healthy",
  worker: "healthy",
  "external-dependency": "healthy",
  "logging-telemetry-pipeline": "healthy",
  "log-store": "healthy",
};

// The Logging + Telemetry Pipeline (and, in the worst cases, the Log
// Store it feeds) are the only components whose health ever degrades in
// this scenario — the API, Worker, and External Dependency stay
// healthy throughout EVERY reachable rule below, including the worst
// cost/audit states. This is a deliberate decoy: a candidate watching
// component health for "what's broken" sees nothing wrong with the
// actual request path, because nothing in the request path is broken —
// the defect is entirely in cost/observability posture.
const costPressureHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "logging-telemetry-pipeline": "degraded",
};

const auditBlindWindowHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "logging-telemetry-pipeline": "critical",
  "log-store": "degraded",
};

/**
 * Authored rule table for Expensive Retry and Logging Amplification,
 * ordered most-specific-first across the ENTIRE table (first-match-wins):
 * the forbidden audit-log-off trap, then the two alternate real strong
 * paths (independently reducing retry-amplification cost vs. telemetry/
 * logging-noise cost), the combined OPTIMAL path, the ACCEPTABLE
 * safe-but-wasteful partial-progress tier, the aggressive-retryCount-0
 * reliability overreach, then the plain unaddressed baseline (the LEAST
 * specific non-fallback rule — it matches on `deployRegressionDetected`
 * alone with no control constraint, so every rule above it that
 * requires a specific control value MUST be listed before it, or it
 * would permanently shadow them), then the healthy-default fallback.
 *
 * ROOT CAUSE: a recent deploy left retryCount/retryOwnership/
 * loggingLevel/samplingRatePercent/payloadLoggingMode/
 * telemetryDuplication/retentionMode all at wasteful defaults. This is
 * a real COST and OBSERVABILITY-POSTURE problem, not an availability
 * incident: requestSuccessRate stays at or near its healthy ceiling in
 * EVERY reachable state in this scenario, including the worst-cost and
 * worst-audit states, and the External Dependency itself is never
 * meaningfully degraded by any rule below — a real decoy signal.
 *
 * ── BUSINESS INVARIANTS (binding for every rule below) ────────────────
 *  1. Security/audit-required logs must remain intact — auditLogIntegrityStatus
 *     stays "intact" on every rule except the explicit loggingLevel="off"
 *     trap family.
 *  2. Operational debugging signal must remain sufficient —
 *     operationalDebugSignalPercent never drops below a usable floor on
 *     any cost-reduction rule that does NOT disable logging outright;
 *     only the audit-off trap also destroys this.
 *  3. Retries must preserve correctness and bounded reliability —
 *     retryCount = 0 (removing retries entirely) is a real overreach:
 *     it maximizes cost savings on the dependency-request axis but
 *     measurably increases real request failure rate, because the rare
 *     genuine transient failure no longer self-heals. retryCount = 1 is
 *     the genuinely safe reduced value.
 *  4. Duplicate/noisy logs may be reduced freely — sampling,
 *     deduplication, payload-mode, and retention-tiering levers all
 *     reduce cost with zero debugging-signal or audit cost, by
 *     construction, on every rule below.
 *  5. Cost reduction must never blind operators or violate audit
 *     requirements — see invariant 1.
 *
 * ── HISTORICAL DAMAGE MODEL (binding, non-resetting) ──────────────────
 * cumulativeAuditLogBlindWindowSeconds only increases while
 * auditLogIntegrityStatus === "blind-window" is ACTUALLY the live state
 * (loggingLevel = "off" while the incident is active). The moment
 * loggingLevel is restored to "verbose"/"standard", the live
 * incidentState moves to a family whose `values.
 * cumulativeAuditLogBlindWindowSeconds` authors a value that stops
 * growing — exactly mirroring Privilege Escalation via Stale
 * Authorization Cache's cumulativeStalePrivilegeGrantCount and Identity
 * Platform Degradation's highRiskActionsAuthenticatedWithoutMfaCount.
 * What is genuinely permanent and non-resetting is
 * state.peaks.peakValues.cumulativeAuditLogBlindWindowSeconds (a
 * numericWatchField with trackPeak:true in definition.ts) — the engine
 * computes this generically as Math.max(previousPeak, currentValue)
 * every tick regardless of which rule currently matches, so a candidate
 * who left loggingLevel="off" active for real elapsed time and then
 * restored it still shows the real blind-window exposure in the
 * completed attempt's scoring, never silently erased by reverting.
 *
 * ── TEMPTING UNSAFE PATH: loggingLevel = "off" (required) ─────────────
 * Disabling all logging from the API and Worker looks like the cheapest,
 * healthiest-looking fix available: dependencyRequestCostUsdPerMonth,
 * loggingCostUsdPerMonth, and telemetryCostUsdPerMonth all collapse to
 * their lowest reachable values in the ENTIRE scenario, and
 * requestSuccessRate is untouched (99.7, identical to every safe path).
 * But it does not merely trim noise — it destroys REQUIRED
 * security/audit log coverage (auditLogIntegrityStatus becomes
 * "blind-window") and operational debugging signal together
 * (operationalDebugSignalPercent collapses to 0), which is exactly why
 * this must never score as a safe cost win.
 *
 * ── ALTERNATE STRONG PATHS (both independently reach materially
 * reduced cost; the OPTIMAL rule below requires BOTH levers combined) ──
 *   A. Retry-amplification-reduced: retryCount <= 1 AND retryOwnership
 *      = "worker-owns-retries" — attacks the dependency-request-cost
 *      axis directly. Logging/telemetry noise is left largely
 *      untouched, so loggingCostUsdPerMonth/telemetryCostUsdPerMonth
 *      stay high even though dependencyRequestCostUsdPerMonth drops
 *      sharply.
 *   B. Telemetry-noise-reduced: samplingRatePercent <= 25 AND
 *      telemetryDuplication = "deduplicated" AND payloadLoggingMode =
 *      "metadata-only" — attacks the logging/telemetry-cost axis
 *      directly, with zero debugging-signal cost (per invariant 4).
 *      Retries are left exactly as the deploy left them, so
 *      dependencyRequestCostUsdPerMonth stays high even though
 *      loggingCostUsdPerMonth/telemetryCostUsdPerMonth drop sharply.
 * These are genuinely, independently viable distinct mechanisms — not a
 * decoy vs. a real answer — each reduces costOverrunPercent by a real,
 * different amount via a materially different lever, and each leaves a
 * real, different amount of waste on the table on the axis it did not
 * touch. Combining both (the OPTIMAL rule) is required to reach the
 * full healthy-baseline cost floor.
 */
export const expensiveRetryAndLoggingAmplificationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE TRAP — required audit/security logs disabled. Checked first;
  // wins regardless of every other control, including a fully-settled
  // elapsed window.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "audit-logging-off-blind-window-settled",
    when: {
      triggerEquals: { deployRegressionDetected: true, costSettlingFullyDone: true },
      controlEquals: { [LOGGING_LEVEL_KEY]: "off" },
    },
    incidentState: "cost-cut-unsafe-settled",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 14_000,
      loggingCostUsdPerMonth: 2_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 18,
      operationalDebugSignalPercent: 0,
      auditLogIntegrityStatus: "blind-window",
      cumulativeAuditLogBlindWindowSeconds: 320,
      costPosture: "cost-cut-unsafe",
    },
    componentHealth: auditBlindWindowHealth,
  },
  {
    id: "audit-logging-off-blind-window",
    when: {
      triggerEquals: { deployRegressionDetected: true },
      controlEquals: { [LOGGING_LEVEL_KEY]: "off" },
    },
    incidentState: "cost-cut-unsafe",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 36_000,
      loggingCostUsdPerMonth: 2_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 22,
      operationalDebugSignalPercent: 0,
      auditLogIntegrityStatus: "blind-window",
      cumulativeAuditLogBlindWindowSeconds: 30,
      costPosture: "cost-cut-unsafe",
    },
    componentHealth: auditBlindWindowHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // OPTIMAL — both alternate strong paths combined, logging never
  // disabled, full settling window elapsed. Listed before each
  // individual alternate path below since this rule's control
  // constraint is strictly more specific (requires every lever from
  // both A and B simultaneously).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "cost-optimized-safe",
    when: {
      triggerEquals: { deployRegressionDetected: true, costSettlingFullyDone: true },
      controlEquals: {
        [RETRY_COUNT_KEY]: 1,
        [RETRY_OWNERSHIP_KEY]: "worker-owns-retries",
        [SAMPLING_RATE_PERCENT_KEY]: 10,
        [TELEMETRY_DUPLICATION_KEY]: "deduplicated",
        [PAYLOAD_LOGGING_MODE_KEY]: "metadata-only",
      },
    },
    incidentState: "cost-optimized-safe",
    values: {
      requestSuccessRate: 99.8,
      dependencyRequestCostUsdPerMonth: 16_000,
      loggingCostUsdPerMonth: 9_000,
      telemetryCostUsdPerMonth: 6_000,
      costOverrunPercent: 0,
      operationalDebugSignalPercent: 92,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "cost-optimized-safe",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH A — retry-amplification reduced; logging/
  // telemetry noise left largely untouched. Listed before the plain
  // unaddressed baseline (which matches with no control constraint).
  //
  // A more specific sub-variant additionally engages dependencyBackoff
  // = "exponential": the SAME retried volume spread out over more
  // elapsed time measurably smooths peak dependency-request pressure
  // (a slightly better requestSuccessRate than the no-backoff variant,
  // since bursty immediate retries occasionally contend with each
  // other at the dependency) — a real, if secondary, consequence of a
  // real accelerant control, never decorative. Listed first since its
  // control constraint is strictly more specific.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "retry-amplification-reduced-backoff-settled",
    when: {
      triggerEquals: { deployRegressionDetected: true, costSettlingFullyDone: true },
      controlEquals: {
        [RETRY_COUNT_KEY]: 1,
        [RETRY_OWNERSHIP_KEY]: "worker-owns-retries",
        [DEPENDENCY_BACKOFF_KEY]: "exponential",
      },
    },
    incidentState: "retry-amplification-reduced-backoff",
    values: {
      requestSuccessRate: 99.9,
      dependencyRequestCostUsdPerMonth: 16_000,
      loggingCostUsdPerMonth: 60_000,
      telemetryCostUsdPerMonth: 43_000,
      costOverrunPercent: 118,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "retry-amplification-reduced",
    },
    componentHealth: costPressureHealth,
  },
  {
    id: "retry-amplification-reduced-settled",
    when: {
      triggerEquals: { deployRegressionDetected: true, costSettlingFullyDone: true },
      controlEquals: {
        [RETRY_COUNT_KEY]: 1,
        [RETRY_OWNERSHIP_KEY]: "worker-owns-retries",
      },
    },
    incidentState: "retry-amplification-reduced",
    values: {
      requestSuccessRate: 99.8,
      dependencyRequestCostUsdPerMonth: 16_000,
      loggingCostUsdPerMonth: 60_000,
      telemetryCostUsdPerMonth: 43_000,
      costOverrunPercent: 118,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "retry-amplification-reduced",
    },
    componentHealth: costPressureHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ALTERNATE STRONG PATH B — telemetry/logging noise reduced; retries
  // left exactly as the deploy left them.
  //
  // A more specific sub-variant additionally engages retentionMode =
  // "tiered": moving routine logs/telemetry to a cheaper retention tier
  // on top of sampling/dedup/metadata-only reduces loggingCostUsdPerMonth
  // further still, a real, measurable, additional cost reduction on top
  // of the base telemetry-noise-reduced numbers. Listed first since its
  // control constraint is strictly more specific.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "telemetry-noise-reduced-tiered-settled",
    when: {
      triggerEquals: { deployRegressionDetected: true, costSettlingFullyDone: true },
      controlEquals: {
        [SAMPLING_RATE_PERCENT_KEY]: 10,
        [TELEMETRY_DUPLICATION_KEY]: "deduplicated",
        [PAYLOAD_LOGGING_MODE_KEY]: "metadata-only",
        [RETENTION_MODE_KEY]: "tiered",
      },
    },
    incidentState: "telemetry-noise-reduced-tiered",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 38_000,
      loggingCostUsdPerMonth: 5_500,
      telemetryCostUsdPerMonth: 6_000,
      costOverrunPercent: 104,
      operationalDebugSignalPercent: 95,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "telemetry-noise-reduced",
    },
    componentHealth: costPressureHealth,
  },
  {
    id: "telemetry-noise-reduced-settled",
    when: {
      triggerEquals: { deployRegressionDetected: true, costSettlingFullyDone: true },
      controlEquals: {
        [SAMPLING_RATE_PERCENT_KEY]: 10,
        [TELEMETRY_DUPLICATION_KEY]: "deduplicated",
        [PAYLOAD_LOGGING_MODE_KEY]: "metadata-only",
      },
    },
    incidentState: "telemetry-noise-reduced",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 38_000,
      loggingCostUsdPerMonth: 9_000,
      telemetryCostUsdPerMonth: 6_000,
      costOverrunPercent: 108,
      operationalDebugSignalPercent: 95,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "telemetry-noise-reduced",
    },
    componentHealth: costPressureHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ACCEPTABLE — legitimate safe-but-wasteful partial progress.
  // loggingLevel stepped down from "verbose" to "standard" (a real,
  // bounded, genuinely safe cost reduction) with no other lever
  // touched. Never unsafe (auditLogIntegrityStatus stays "intact",
  // operationalDebugSignalPercent stays fully sufficient) but leaves
  // the large majority of the regression's cost on the table — the
  // scenario's required degraded-but-safe tier. Listed before the plain
  // unaddressed baseline since this rule's loggingLevel constraint is
  // more specific than "no control constraint at all."
  // ══════════════════════════════════════════════════════════════════
  {
    id: "safe-but-wasteful-standard-logging",
    when: {
      triggerEquals: { deployRegressionDetected: true },
      controlEquals: { [LOGGING_LEVEL_KEY]: "standard" },
    },
    incidentState: "safe-but-wasteful",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 38_000,
      loggingCostUsdPerMonth: 42_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 168,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "unaddressed",
    },
    componentHealth: costPressureHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // RELIABILITY OVERREACH — retryCount = 0 removes retries entirely.
  // Maximizes dependency-request-cost savings but genuinely increases
  // real request failure rate, because the rare authentic transient
  // dependency hiccup no longer self-heals. Listed before the plain
  // unaddressed baseline since this rule's retryCount constraint is
  // more specific than "no control constraint at all."
  // ══════════════════════════════════════════════════════════════════
  {
    id: "retry-removed-reliability-overreach",
    when: {
      triggerEquals: { deployRegressionDetected: true },
      controlEquals: { [RETRY_COUNT_KEY]: 0 },
    },
    incidentState: "retry-removed-overreach",
    values: {
      requestSuccessRate: 98.6,
      dependencyRequestCostUsdPerMonth: 9_000,
      loggingCostUsdPerMonth: 61_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 150,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "unaddressed",
    },
    componentHealth: costPressureHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PLAIN UNADDRESSED BASELINE — safe but wasteful, no corrective
  // action taken at all. Listed LAST before the healthy-default
  // fallback: these two rules match on `deployRegressionDetected` alone
  // with no control constraint, so every rule above that requires a
  // specific control value must come before these two or it would be
  // permanently shadowed.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "unaddressed-sustained",
    when: {
      triggerEquals: { deployRegressionDetected: true, sustainedUnaddressed: true },
    },
    incidentState: "unaddressed-sustained",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 38_000,
      loggingCostUsdPerMonth: 61_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 210,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "unaddressed",
    },
    componentHealth: costPressureHealth,
  },
  {
    id: "unaddressed-baseline",
    when: { triggerEquals: { deployRegressionDetected: true } },
    incidentState: "unaddressed-baseline",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 38_000,
      loggingCostUsdPerMonth: 61_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 210,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "unaddressed",
    },
    componentHealth: costPressureHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      requestSuccessRate: 99.7,
      dependencyRequestCostUsdPerMonth: 38_000,
      loggingCostUsdPerMonth: 61_000,
      telemetryCostUsdPerMonth: 44_000,
      costOverrunPercent: 210,
      operationalDebugSignalPercent: 100,
      auditLogIntegrityStatus: "intact",
      cumulativeAuditLogBlindWindowSeconds: 0,
      costPosture: "unaddressed",
    },
    componentHealth: healthyHealth,
  },
];
