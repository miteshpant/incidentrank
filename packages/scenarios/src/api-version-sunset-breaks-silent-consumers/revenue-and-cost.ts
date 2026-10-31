import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { ENABLE_COMPATIBILITY_SHIM_KEY, EXTEND_SUNSET_DEADLINE_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  breaking: 340,
  degraded: 140,
  recovering: 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 250,
  perUnitMonthlyUsd: {
    [`${EXTEND_SUNSET_DEADLINE_KEY}:false`]: 0,
    [`${EXTEND_SUNSET_DEADLINE_KEY}:true`]: 70,
    [`${ENABLE_COMPATIBILITY_SHIM_KEY}:false`]: 0,
    [`${ENABLE_COMPATIBILITY_SHIM_KEY}:true`]: 130,
  },
};

// Deliberately keyed off `unregisteredV1CallerCount` (the real root-cause
// signal), not off the gateway-side error rate alone — this is what
// prevents the hard-cutover trap from ever reading as "resolved": that
// path drives the gateway's own error rate back to baseline immediately
// while leaving unregisteredV1CallerCount (and the resulting ticket
// backlog) exactly as bad as the baseline incident.
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "unregisteredV1CallerCount", operator: "less_than_or_equal", comparedTo: 5 },
    { key: "orderCreationFailureRatePercent", operator: "less_than_or_equal", comparedTo: 1 },
    { key: "supportTicketBacklogCount", operator: "less_than_or_equal", comparedTo: 10 },
  ],
  sustainedSeconds: 15,
};

export const failureCondition: FailureCondition = {
  conditions: [{ key: "supportTicketBacklogCount", operator: "greater_than_or_equal", comparedTo: 60 }],
  sustainedSeconds: 60,
};
