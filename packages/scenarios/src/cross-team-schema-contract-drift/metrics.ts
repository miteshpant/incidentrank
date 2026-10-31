import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Root cause signal: how many events on the bus fail schema validation
  // against the OLD contract every consumer was built against.
  schemaViolationRatePercent: 0,

  // Billing Pipeline: silently DROPS any event it can't map a customerId
  // from, so billed-order count silently undercounts. No crash, no
  // error spike a dashboard would obviously flag.
  billingDroppedEventCount: 0,
  billingUnbilledRevenueUsd: 0,

  // Analytics Warehouse: does NOT drop events — it writes them anyway,
  // with customerId coerced to null/garbage, silently corrupting rows
  // already landed in the warehouse. Distinct failure mode from Billing:
  // corruption, not loss.
  analyticsCorruptedRowPercent: 0,

  // Fraud Detection: throws on deserialization and crash-loops, so its
  // consumer lag backs up hard and fast — the most visually alarming
  // signal, but fixing only this pipeline leaves the other two silently
  // broken.
  fraudConsumerLagSeconds: 4,
  fraudPodRestartCount: 0,

  // Noise: a completely unrelated nightly compaction job on the
  // warehouse's storage layer. Climbs on its own schedule, has nothing
  // to do with the schema drift, but looks alarming on a dashboard at
  // the same time the incident is unfolding.
  warehouseCompactionQueueDepth: 3,

  diagnosisPath: "not-attempted",
};
