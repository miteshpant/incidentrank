import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { ENABLE_EU_DATA_LOCK_GATEWAY_KEY } from "./controls";

/**
 * Revenue loss is deliberately near-zero for "violating" — this is the
 * entire point of the scenario. The automatic failover already restored
 * availability, so the naive "is revenue being lost right now" signal
 * says everything is fine while a live compliance violation accrues.
 * Revenue loss only appears once a strategy reopens the outage
 * ("degraded") — the real cost of fixing the violation the wrong way.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  violating: 15,
  degraded: 650,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 900,
  perUnitMonthlyUsd: {
    [`${ENABLE_EU_DATA_LOCK_GATEWAY_KEY}:true`]: 180,
  },
};

/**
 * Full resolution requires EU availability to be healthy AND the
 * data-residency violation to have actually stopped accruing — either
 * alone is not enough, mirroring the scenario's core lesson that an
 * availability-only dashboard cannot tell this incident is resolved.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "euRequestAvailabilityPercent", operator: "greater_than_or_equal", comparedTo: 99 },
    { key: "dataResidencyViolationMinutes", operator: "equals", comparedTo: 0 },
    { key: "euPersonalDataRecordsProcessedInUsCount", operator: "equals", comparedTo: 0 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "euRequestAvailabilityPercent", operator: "less_than", comparedTo: 75 }],
  sustainedSeconds: 60,
};
