import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  requestVolumePerSec: 900,
  suspiciousTrafficRatioPct: 6,
  customerSuccessRatePct: 99.5,
  falsePositiveRatePct: 0,
  backendLoadPct: 22,
  rateLimitBlocksPerSec: 0,
  trafficStatus: "normal",
  // Generic string-state field (Phase 6.1 precedent: Kafka Partition
  // Skew's orderingMode, Missing Database Index's orderHistoryQueryHealth)
  // distinguishing WHY backend load looks healthy — "targeted" means bot
  // traffic was actually suppressed through identity/endpoint-scoped
  // precision; "coarse-blocked" means it was suppressed by blunt
  // across-the-board friction that also caught real customers;
  // "unresolved" means neither has happened yet. Read only by
  // successCondition/acceptableCondition/scoring, never by any
  // scenario-specific scorer code.
  defenseMode: "unresolved",
};
