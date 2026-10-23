import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { SERVICE_CONCURRENCY_KEY, WRITE_SERIALIZATION_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "deadlocking-critical": 600,
  "deadlocking-surge-critical": 900,
  "masked-retry-amplification": 750,
  "masked-retry-amplification-moderate": 520,
  "partial-bounded": 340,
  "partial-mitigated": 200,
  "deadlocking-no-retry": 420,
  // Write serialization is a genuine (if slow) safe handback — a visible
  // but bounded ongoing cost from reduced checkout throughput, not an
  // active incident burn rate.
  "recovered-serialized": 60,
  "recovered-canonical": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 400,
  perUnitMonthlyUsd: {
    [`${SERVICE_CONCURRENCY_KEY}:4`]: 0,
    [`${SERVICE_CONCURRENCY_KEY}:8`]: 0,
    [`${SERVICE_CONCURRENCY_KEY}:16`]: 220,
    [`${SERVICE_CONCURRENCY_KEY}:32`]: 520,
    [`${WRITE_SERIALIZATION_KEY}:true`]: 40,
  },
};

// OPTIMAL: lock ordering fixed, deadlocks structurally impossible —
// checkout failure rate at its honest floor, DB healthy.
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "deadlocksPerSec", operator: "equals", comparedTo: 0 },
    { key: "checkoutFailureRate", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "lockOrderingMode", operator: "equals", comparedTo: "fixed" },
  ],
  sustainedSeconds: 15,
};

// ACCEPTABLE: write serialization removes deadlocks by construction (also
// deadlocksPerSec === 0) but at materially worse latency/throughput — a
// genuinely safe-but-imperfect handback, not a disguised unsafe state.
// Distinguished from optimal purely by the authored writeSerializationActive
// state field, never inferred from "how good checkoutFailureRate looks."
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "deadlocksPerSec", operator: "equals", comparedTo: 0 },
    { key: "dbStatus", operator: "not_equals", comparedTo: "critical" },
    { key: "writeSerializationActive", operator: "equals", comparedTo: "on" },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "checkoutFailureRate", operator: "greater_than_or_equal", comparedTo: 20 }],
  sustainedSeconds: 60,
};
