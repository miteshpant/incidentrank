import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { REPLICA_COUNT_KEY, REPLICATION_WORKER_COUNT_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "storage-exhausted": 1_100,
  "batch-overload": 900,
  "fanout-overload": 800,
  "backlog-growing": 650,
  "priority-shed-partial": 520,
  "primary-overloaded": 480,
  "reads-isolated": 420,
  "throttled-partial": 260,
  "parallelism-partial": 220,
  "throttled-recovered": 40,
  "parallelism-recovered": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 500,
  perUnitMonthlyUsd: {
    [`${REPLICATION_WORKER_COUNT_KEY}:2`]: 0,
    [`${REPLICATION_WORKER_COUNT_KEY}:4`]: 120,
    [`${REPLICATION_WORKER_COUNT_KEY}:8`]: 320,
    [`${REPLICATION_WORKER_COUNT_KEY}:16`]: 700,
    [`${REPLICA_COUNT_KEY}:1`]: 0,
    [`${REPLICA_COUNT_KEY}:2`]: 450,
    [`${REPLICA_COUNT_KEY}:3`]: 900,
  },
};

/**
 * Full recovery: both replicationLagMs and staleReadAgeMs have returned
 * to a durably sustainable level AND primaryStatus is no longer
 * critical. Gating on both the lag field (the replication pipeline
 * itself) and the stale-read-age field (what reads actually observe) is
 * deliberate: "reads-isolated" reaches staleReadAgeMs === 0 for the
 * fresh-read traffic routed to the primary while leaving
 * replicationLagMs at 32,000ms and still climbing — a real,
 * uncontained backlog that happens to look safe from the read side
 * alone. Requiring BOTH fields low is what correctly excludes that
 * state from success, mirroring Split-Brain Incident's
 * writeAuthorityState/conflictCount dual-field gate: a single
 * customer-visible metric reading healthy is never sufficient proof of
 * safety on its own.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "replicationLagMs", operator: "less_than_or_equal", comparedTo: 1_000 },
    { key: "staleReadAgeMs", operator: "less_than_or_equal", comparedTo: 1_000 },
    { key: "primaryStatus", operator: "not_equals", comparedTo: "critical" },
  ],
  sustainedSeconds: 30,
};

/**
 * Failure: the backlog has been allowed to grow large enough, for long
 * enough, that staging storage for unapplied write-ahead segments is
 * exhausted — an unrecoverable-without-intervention storage event, not
 * merely "still degraded."
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "storagePressure", operator: "greater_than_or_equal", comparedTo: 95 }],
  sustainedSeconds: 45,
};
