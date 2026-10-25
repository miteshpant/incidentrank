import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { ORIGIN_CONCURRENCY_KEY, REFRESH_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-desync": 90,
  "baseline-sustained-desync": 260,
  "global-bypass-origin-overload": 340,
  "global-bypass-origin-overload-sustained": 520,
  "global-bypass-refresh-concurrency-amplified": 600,
  "eu-storm-contagion-unisolated": 310,
  "us-targeted-bypass-eu-storming": 70,
  "eu-targeted-dedup-us-stale": 55,
  "bounded-acceptable-swr": 10,
  "recovery-just-engaged": 60,
  "recovery-window1-draining": 35,
  "recovery-window2-near-recovered": 15,
  "fully-recovered": 0,
  "fully-recovered-via-swr": 0,
  "origin-capacity-only-partial-relief": 85,
  "high-refresh-concurrency-amplifies-storm": 200,
  "long-ttl-worsens-staleness-bound": 95,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_200,
  perUnitMonthlyUsd: {
    [`${ORIGIN_CONCURRENCY_KEY}:high`]: 420,
    [`${REFRESH_CONCURRENCY_KEY}:high`]: 160,
  },
};

/**
 * OPTIMAL: invalidation desync active, every regional freshness signal
 * back to normal (US within bound, EU storm stopped, APAC untouched),
 * Origin fully settled, and invalidationSystemStatus explicitly reads
 * "fully-recovered" — only reachable via "fully-recovered" or
 * "fully-recovered-via-swr" in rules.ts, both of which require BOTH
 * regional fixes genuinely engaged AND the full recovery window to
 * have elapsed. A candidate who merely bypassed US without fixing EU
 * (or vice versa) never reaches this regardless of elapsed time,
 * because the other region's rule state never carries
 * invalidationSystemStatus = "fully-recovered".
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "usFreshnessStatus", operator: "equals", comparedTo: "normal" },
    { key: "euInvalidationStormStatus", operator: "equals", comparedTo: "normal" },
    { key: "apacFreshnessStatus", operator: "equals", comparedTo: "normal" },
    { key: "originStatus", operator: "equals", comparedTo: "normal" },
    { key: "invalidationSystemStatus", operator: "equals", comparedTo: "fully-recovered" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the bounded-stale-but-safe degraded state the spec
 * explicitly encourages (phase6d3.md's "one region may legitimately
 * keep serving bounded stale data while invalidation catches up
 * elsewhere"). usFreshnessStatus is allowed to be "warning" (bounded
 * staleness, never "critical"/unbounded), EU's storm has genuinely
 * stopped, Origin is protected, and invalidationSystemStatus explicitly
 * reads "bounded-acceptable" — the gate that keeps an unbounded-stale
 * baseline state from accidentally qualifying merely because its
 * numbers happen to look survivable at some instant.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "usFreshnessStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "euInvalidationStormStatus", operator: "equals", comparedTo: "normal" },
    { key: "originStatus", operator: "equals", comparedTo: "normal" },
    { key: "invalidationSystemStatus", operator: "equals", comparedTo: "bounded-acceptable" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: Origin has been critically overloaded for long enough that
 * it represents a genuine capacity collapse risk — reachable primarily
 * via the global-bypass trap (and its refresh-concurrency-amplified
 * variant) sustained too long. This is the catastrophic outcome: the
 * shared Origin Store, which every region ultimately depends on, is
 * pushed past safe capacity for a sustained period.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "originStatus", operator: "equals", comparedTo: "critical" },
    { key: "originLatencyMs", operator: "greater_than_or_equal", comparedTo: 3_000 },
  ],
  sustainedSeconds: 60,
};
