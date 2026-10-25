import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { API_CAPACITY_KEY, QUERY_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "baseline-unmitigated": 420,
  "concurrency-raised-alone-worsens-pressure": 550,
  "scale-symptom-worsens-pressure": 900,
  "index-timeout-tightened-during-pressure-transfer": 1_600,
  "unsafe-partial-results-no-cache-bound": 60,
  "restore-too-early-retrigger": 700,
  "degraded-quality-safe-draining": 40,
  "degraded-quality-safe-drained": 10,
  "restored-safely-after-drain": 0,
  "timeout-shortened-alone-partial-relief": 240,
  "feature-store-reduced-alone-partial-relief": 300,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${QUERY_CONCURRENCY_KEY}:200`]: 120,
    [`${QUERY_CONCURRENCY_KEY}:400`]: 320,
    [`${API_CAPACITY_KEY}:200`]: 140,
    [`${API_CAPACITY_KEY}:400`]: 360,
  },
};

/**
 * Full recovery: ranking is live again (basic search AND re-ranking
 * both healthy), the Query Coordinator's held-connection pressure has
 * genuinely drained (indexClusterAConnections/indexClusterBConnections/
 * featureStoreQps back at baseline), and the historical correctness
 * counter stayed at the value it reached (never nonzero-and-growing
 * NOW). Gated directly on the real pressure/correctness fields, never
 * on "basicSearchSuccessRatePercent is high" alone -- the scale-the-
 * symptom trap and the unsafe-partial-results path can both show a
 * healthy-looking success rate while index/correctness state is not
 * actually safe.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "basicSearchSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "indexClusterAConnections", operator: "less_than_or_equal", comparedTo: 65 },
    { key: "indexClusterBConnections", operator: "less_than_or_equal", comparedTo: 65 },
    { key: "featureStoreQps", operator: "less_than_or_equal", comparedTo: 900 },
    { key: "coordinatorPressureStatus", operator: "equals", comparedTo: "normal" },
    // Direct correctness gate (phase6d.2.md section 9/10): a state
    // reached via the unsafe partial-results-without-cache combination
    // must never satisfy successCondition, however healthy every
    // numeric/availability metric above happens to read. Explicit,
    // never inferred from the numeric bounds alone.
    { key: "responsePathMode", operator: "not_equals", comparedTo: "unsafe-partial-results" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable: a genuinely safe, bounded, deliberately degraded state --
 * basic search is fully healthy, Index Cluster A/B connection pressure
 * and Feature Store QPS are visibly reduced from the unmitigated
 * baseline (even if not yet all the way back to true pre-incident
 * baseline during the drain window), AND the historical correctness
 * counter is NOT currently growing. The business invariant explicitly
 * permits ranking/feature enrichment to be degraded, so a candidate who
 * reaches this and stops is making a complete, correct decision --
 * never merely "almost fixed."
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "basicSearchSuccessRatePercent", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "indexClusterAConnections", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "indexClusterBConnections", operator: "less_than_or_equal", comparedTo: 150 },
    { key: "coordinatorPressureStatus", operator: "not_equals", comparedTo: "critical" },
    // Same direct correctness gate as successCondition above: the
    // unsafe-partial-results-without-cache state (indexClusterA/B
    // Connections=150, coordinatorPressureStatus="warning",
    // basicSearchSuccessRatePercent=99.5) would otherwise satisfy every
    // OTHER bound here by coincidence of its authored numeric values --
    // this explicit gate is what actually, provably keeps a real,
    // actively-growing correctness violation out of the acceptable
    // tier, never relying on the numeric bounds to do that job
    // incidentally.
    { key: "responsePathMode", operator: "not_equals", comparedTo: "unsafe-partial-results" },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: basic search itself has been sustained unavailable/failing
 * -- the one invariant that is never allowed to break, regardless of
 * how ranking/feature enrichment are being handled. A long enough
 * window of basicSearchSuccessRatePercent below a hard floor means the
 * candidate has let the "basic search is business-critical" invariant
 * break, not merely degraded an optional capability.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "basicSearchSuccessRatePercent", operator: "less_than", comparedTo: 65 },
  ],
  sustainedSeconds: 90,
};
