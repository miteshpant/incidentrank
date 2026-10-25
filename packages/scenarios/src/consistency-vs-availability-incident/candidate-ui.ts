import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BALANCE_CONSISTENCY_MODE_KEY,
  CATALOG_CONSISTENCY_MODE_KEY,
  CATALOG_RECONCILIATION_KEY,
  QUORUM_REQUIREMENT_KEY,
  UNCONFIRMED_WRITE_POLICY_KEY,
  WRITE_ROUTING_KEY,
} from "./controls";

export const consistencyVsAvailabilityIncidentCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "balanceWriteAvailability", label: "Balance Write Availability", sourceStateKey: "balanceWriteAvailability", format: "percentage" },
    { key: "catalogWriteAvailability", label: "Catalog Write Availability", sourceStateKey: "catalogWriteAvailability", format: "percentage" },
    { key: "balanceCorrectnessViolations", label: "Balance Correctness Violations", sourceStateKey: "balanceCorrectnessViolations", format: "number" },
    { key: "balanceWriteQueueDepth", label: "Balance Write Queue Depth", sourceStateKey: "balanceWriteQueueDepth", format: "number" },
    { key: "balanceWriteRejectedCount", label: "Balance Writes Rejected", sourceStateKey: "balanceWriteRejectedCount", format: "number" },
    { key: "catalogStalenessSeconds", label: "Catalog Staleness", sourceStateKey: "catalogStalenessSeconds", format: "duration" },
    { key: "catalogDivergentKeyCount", label: "Catalog Divergent Keys", sourceStateKey: "catalogDivergentKeyCount", format: "number" },
    { key: "regionConnectivity", label: "Cross-Region Connectivity", sourceStateKey: "regionConnectivity", format: "status" },
    { key: "balanceSafetyStatus", label: "Balance Safety Status", sourceStateKey: "balanceSafetyStatus", format: "status" },
  ],
  controls: [
    {
      key: BALANCE_CONSISTENCY_MODE_KEY,
      label: "Balance Consistency Mode",
      componentId: "data-service",
      valueLabels: { strong: "Strong (Cross-Region Confirmed)", relaxed: "Relaxed (Local Only)" },
    },
    {
      key: CATALOG_CONSISTENCY_MODE_KEY,
      label: "Catalog Consistency Mode",
      componentId: "data-service",
      valueLabels: { strong: "Strong (Cross-Region Confirmed)", relaxed: "Relaxed (Local Only)" },
    },
    {
      key: WRITE_ROUTING_KEY,
      label: "Write Routing",
      componentId: "data-service",
      valueLabels: {
        "both-regions": "Both Regions",
        "single-region-a": "Single Region (A)",
        "single-region-b": "Single Region (B)",
      },
    },
    {
      key: QUORUM_REQUIREMENT_KEY,
      label: "Quorum Requirement",
      componentId: "data-service",
      valueLabels: { "both-regions": "Require Both Regions", "local-only": "Local Only" },
    },
    {
      key: UNCONFIRMED_WRITE_POLICY_KEY,
      label: "Unconfirmed Write Policy",
      componentId: "data-service",
      valueLabels: { queue: "Queue Until Confirmed", reject: "Reject Immediately" },
    },
    {
      key: CATALOG_RECONCILIATION_KEY,
      label: "Catalog Reconciliation Policy",
      componentId: "data-service",
      valueLabels: {
        "last-write-wins": "Last Write Wins",
        "merge-latest-per-field": "Merge Latest Per Field",
      },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "data-service", label: "Distributed Data Service" },
    { id: "region-a", label: "Region A" },
    { id: "region-b", label: "Region B" },
  ],
};
