import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import {
  PAYLOAD_LOGGING_MODE_KEY,
  RETENTION_MODE_KEY,
  SAMPLING_RATE_PERCENT_KEY,
} from "./controls";

/**
 * This is never an availability outage — requestSuccessRate stays at or
 * near its healthy ceiling in every reachable state, including the
 * worst-cost and worst-audit states. revenueLossRatePerMinute is
 * therefore 0 everywhere: the entire incident is a cost/observability
 * problem, never a lost-revenue problem. customerImpact scoring
 * (measure: revenueLossUsd) will correctly award full credit on every
 * reachable path here — the real judgment this scenario tests lives in
 * costEfficiency, dataIntegrity, and operationalEfficiency instead.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "unaddressed-baseline": 0,
  "unaddressed-sustained": 0,
  "cost-cut-unsafe": 0,
  "cost-cut-unsafe-settled": 0,
  "retry-amplification-reduced": 0,
  "telemetry-noise-reduced": 0,
  "cost-optimized-safe": 0,
  "safe-but-wasteful": 0,
  "retry-removed-overreach": 0,
};

/**
 * Baseline infra cost intentionally does NOT include
 * dependencyRequestCostUsdPerMonth/loggingCostUsdPerMonth/
 * telemetryCostUsdPerMonth — those are modeled as explicit state values
 * (metrics.ts), narrated per-rule, and read by costOverrunPercent /
 * scoring's string-state measures directly, mirroring how other
 * scenarios keep their headline cost metric as a `values` field rather
 * than folding it into the generic infra-cost model. infrastructureCost
 * here instead captures the SMALL, real, additive cost of the safe
 * remediation levers themselves — tiered retention and low-sample
 * telemetry both require a small amount of additional pipeline tooling
 * to operate correctly, and full-payload logging requires more storage
 * throughput than metadata-only logging, which is captured as a real,
 * small REMOVED cost (metadata-only is the default/safe choice, so it
 * costs less than full-payload, not more) — keeping costEfficiency's
 * `costIncreaseRatio` measure meaningful without duplicating the
 * headline cost-overrun numbers already tracked explicitly.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 4_000,
  perUnitMonthlyUsd: {
    [`${RETENTION_MODE_KEY}:tiered`]: 150,
    [`${SAMPLING_RATE_PERCENT_KEY}:10`]: 60,
    [`${PAYLOAD_LOGGING_MODE_KEY}:full-payload`]: 400,
  },
};

/**
 * OPTIMAL: cost fully back to the healthy baseline
 * (costOverrunPercent = 0) via the combined remediation (both alternate
 * strong paths engaged together), with audit integrity intact and
 * debugging signal still sufficient. Only reachable via
 * cost-optimized-safe in rules.ts, which requires the full settling
 * window to have genuinely elapsed.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "costOverrunPercent", operator: "equals", comparedTo: 0 },
    { key: "auditLogIntegrityStatus", operator: "equals", comparedTo: "intact" },
    { key: "operationalDebugSignalPercent", operator: "greater_than_or_equal", comparedTo: 85 },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — a real, bounded
 * cost reduction was made (loggingLevel stepped down from verbose to
 * standard) and every REQUIRED invariant is still fully intact, but the
 * large majority of the regression's cost is still present
 * (costOverrunPercent stays well above 0). This tier differs from
 * OPTIMAL only in leaving real, avoidable cost on the table, never in
 * accepting any audit/debugging-signal risk. Reachable from
 * safe-but-wasteful only.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "auditLogIntegrityStatus", operator: "equals", comparedTo: "intact" },
    { key: "operationalDebugSignalPercent", operator: "greater_than_or_equal", comparedTo: 85 },
    { key: "costOverrunPercent", operator: "less_than", comparedTo: 210 },
    { key: "costOverrunPercent", operator: "greater_than", comparedTo: 0 },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: a sustained, severe audit-log blind window — REQUIRED
 * security/audit logging has been disabled long enough, for long
 * enough accumulated blind-window time, to constitute a catastrophic,
 * irrecoverable compliance failure within this attempt. Gated on the
 * cumulative count (real accumulated blind-window seconds), not merely
 * the instantaneous status, so a brief accidental flip is not instantly
 * fatal but a sustained loggingLevel="off" window is.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "cumulativeAuditLogBlindWindowSeconds", operator: "greater_than_or_equal", comparedTo: 300 },
  ],
  sustainedSeconds: 30,
};
