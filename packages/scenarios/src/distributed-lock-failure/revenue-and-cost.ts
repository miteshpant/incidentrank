import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { LEASE_DURATION_SECONDS_KEY, WORKER_CONCURRENCY_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "overlapping-owners-retry-storm": 900,
  "overlapping-owners-amplified": 850,
  "overlapping-owners": 500,
  "long-lease-no-fencing-crash": 700,
  "renewed-crash-slow-recovery": 300,
  "renewed-crash-fast-recovery": 90,
  "fenced-safe-fast-recovery": 60,
  "long-lease-no-fencing": 40,
  "renewed-safe": 10,
  "fenced-safe": 10,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 250,
  perUnitMonthlyUsd: {
    [`${WORKER_CONCURRENCY_KEY}:2`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:4`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:8`]: 0,
    [`${WORKER_CONCURRENCY_KEY}:16`]: 120,
    [`${LEASE_DURATION_SECONDS_KEY}:5`]: 0,
    [`${LEASE_DURATION_SECONDS_KEY}:15`]: 0,
    [`${LEASE_DURATION_SECONDS_KEY}:30`]: 0,
    [`${LEASE_DURATION_SECONDS_KEY}:60`]: 0,
    [`${LEASE_DURATION_SECONDS_KEY}:120`]: 0,
  },
};

/**
 * Full recovery: correctnessViolationCount is zero (the only safe
 * value — this is the field Data Integrity scoring gates on) AND the
 * lock service itself has returned to "normal" status. Deliberately
 * does NOT require overlappingOwnerCount === 0: the fenced-safe path
 * can still have a lease expire mid-processing and a second worker
 * briefly believe it holds the lock (overlappingOwnerCount > 0) while
 * remaining completely safe, because the fencing token makes the
 * superseded worker's write harmless rather than preventing the
 * overlap from ever occurring at all. correctnessViolationCount is the
 * real, authored evidence of whether a conflicting write actually
 * landed — gating success on that field directly (not on the
 * occurrence of overlap itself) is the whole point of this scenario's
 * fencing-vs-lease-tuning distinction. See definition.ts's audit for
 * why both the fenced path and the long-lease-without-fencing path
 * reach correctnessViolationCount=0 (while no crash has occurred) and
 * why only fencing is treated as the genuinely optimal, durable fix —
 * that distinction is carried by Data Integrity scoring (scoring.ts),
 * not by a second completion tier.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "correctnessViolationCount", operator: "equals", comparedTo: 0 },
    { key: "lockServiceStatus", operator: "equals", comparedTo: "normal" },
  ],
  sustainedSeconds: 15,
};

/**
 * Failure: a real, sustained run of overlapping ownership producing
 * genuine correctness violations against the shared resource —
 * irrecoverable corruption risk if left running.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "correctnessViolationCount", operator: "greater_than_or_equal", comparedTo: 15 },
  ],
  sustainedSeconds: 60,
};
