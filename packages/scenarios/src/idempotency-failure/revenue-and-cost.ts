import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { KEY_TTL_SECONDS_KEY, STORAGE_MODE_KEY, WORKER_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "wasted-scaling-failopen": 900,
  "failopen-duplicating-amplified": 820,
  "unreachable-duplicating": 700,
  "failopen-duplicating": 600,
  "failclosed-degraded-availability": 520,
  "ttl-eviction-duplicating": 340,
  "scope-too-broad-suppressing": 300,
  degrading: 140,
  deduplicated: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 180,
  perUnitMonthlyUsd: {
    [`${STORAGE_MODE_KEY}:single-node`]: 0,
    [`${STORAGE_MODE_KEY}:replicated`]: 90,
    [`${KEY_TTL_SECONDS_KEY}:15`]: 0,
    [`${KEY_TTL_SECONDS_KEY}:60`]: 5,
    [`${KEY_TTL_SECONDS_KEY}:300`]: 15,
    [`${KEY_TTL_SECONDS_KEY}:1800`]: 40,
    [`${WORKER_CONCURRENCY_KEY}:4`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:8`]: 60,
    [`${WORKER_CONCURRENCY_KEY}:16`]: 150,
    [`${WORKER_CONCURRENCY_KEY}:32`]: 340,
  },
};

/**
 * Full recovery: deliberately gates on the real correctness counter
 * (duplicateSideEffectCount <= 0) AND duplicationSafetyStatus === "safe",
 * never on requestSuccessRatePct or externalSideEffectRatePermin alone —
 * both of those availability-looking metrics can and do look perfectly
 * healthy during the fail-open-while-unreachable trap even as duplicates
 * climb. A real correctness violation (duplicates actually occurring, or
 * the too-broad-scope suppression failure) must never be masked by
 * healthy-looking throughput here. See rules.ts's
 * unreachable-failopen-unsafe / wasted-scaling-failopen /
 * scope-too-broad-suppressing states, none of which satisfy this.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "duplicateSideEffectCount", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "idempotencyStoreHealth", operator: "not_equals", comparedTo: "critical" },
    { key: "duplicationSafetyStatus", operator: "equals", comparedTo: "safe" },
  ],
  sustainedSeconds: 30,
};

/**
 * Acceptable handback: fail-closed under store unreachability. Duplicate
 * side effects genuinely stay at zero (the real correctness counter, not
 * merely a label) — this is a legitimate, bounded tradeoff: real,
 * visible availability loss (requestSuccessRatePct down to ~71%,
 * externalSideEffectRatePerMin well below baseline — queued/rejected
 * requests) accepted deliberately to hold correctness while the store
 * itself is still unhealthy. See completion-mode audit in definition.ts
 * for why this crosses the "safe enough to hand back despite a bounded
 * tradeoff" bar while every duplicating state does not, regardless of
 * how healthy THEIR throughput looks.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "duplicateSideEffectCount", operator: "less_than_or_equal", comparedTo: 0 },
    { key: "duplicationSafetyStatus", operator: "equals", comparedTo: "safe" },
  ],
  sustainedSeconds: 30,
};

export const failureCondition: FailureCondition = {
  conditions: [
    { key: "duplicateSideEffectCount", operator: "greater_than_or_equal", comparedTo: 500 },
  ],
  sustainedSeconds: 60,
};
