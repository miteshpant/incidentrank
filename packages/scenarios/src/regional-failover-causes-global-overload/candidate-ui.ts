import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
  REGION_A_RESTORATION_KEY,
  TRAFFIC_RESTORE_PACE_KEY,
} from "./controls";

export const regionalFailoverCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "regionATrafficPct", label: "Region A Traffic Share", sourceStateKey: "regionATrafficPct", format: "percentage" },
    { key: "regionBTrafficPct", label: "Region B Traffic Share", sourceStateKey: "regionBTrafficPct", format: "percentage" },
    { key: "regionCTrafficPct", label: "Region C Traffic Share", sourceStateKey: "regionCTrafficPct", format: "percentage" },
    { key: "regionAFailoverPct", label: "Region A Failed Over", sourceStateKey: "regionAFailoverPct", format: "percentage" },
    { key: "shedTrafficPct", label: "Optional Traffic Shed", sourceStateKey: "shedTrafficPct", format: "percentage" },
    { key: "regionACriticalTrafficDroppedPct", label: "Critical Traffic Dropped", sourceStateKey: "regionACriticalTrafficDroppedPct", format: "percentage" },
    { key: "regionBApiUtilization", label: "Region B API Utilization", sourceStateKey: "regionBApiUtilization", format: "percentage" },
    { key: "regionCApiUtilization", label: "Region C API Utilization", sourceStateKey: "regionCApiUtilization", format: "percentage" },
    { key: "regionBDbUtilization", label: "Region B DB Utilization", sourceStateKey: "regionBDbUtilization", format: "percentage" },
    { key: "regionCDbUtilization", label: "Region C DB Utilization", sourceStateKey: "regionCDbUtilization", format: "percentage" },
    { key: "regionBCacheHitRate", label: "Region B Cache Hit Rate", sourceStateKey: "regionBCacheHitRate", format: "percentage" },
    { key: "regionCCacheHitRate", label: "Region C Cache Hit Rate", sourceStateKey: "regionCCacheHitRate", format: "percentage" },
    { key: "globalSuccessRate", label: "Global Success Rate", sourceStateKey: "globalSuccessRate", format: "percentage" },
    { key: "queueDepth", label: "Region B/C Queue Depth", sourceStateKey: "queueDepth", format: "number" },
    { key: "secondRegionRiskStatus", label: "Second-Region Risk", sourceStateKey: "secondRegionRiskStatus", format: "status" },
  ],
  controls: [
    {
      key: FAILOVER_CAP_KEY,
      label: "Failover Cap",
      componentId: "global-router",
      valueLabels: { "0": "0%", "25": "25%", "50": "50%", "80": "80%", "100": "100% (Uncapped)" },
    },
    {
      key: LOW_PRIORITY_TRAFFIC_KEY,
      label: "Low-Priority Traffic Policy",
      componentId: "global-router",
      valueLabels: { serve: "Serve", shed: "Shed" },
    },
    {
      key: CACHE_PROTECTION_KEY,
      label: "Cache Protection (Region B/C)",
      componentId: "region-b-cache",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: DB_CONCURRENCY_KEY,
      label: "DB Concurrency (Region B/C)",
      componentId: "region-b-db",
      valueLabels: { uncapped: "Uncapped", capped: "Capped" },
    },
    {
      key: REGION_A_RESTORATION_KEY,
      label: "Region A Restoration Mode",
      componentId: "region-a-api",
      valueLabels: { offline: "Offline", partial: "Partial", full: "Full" },
    },
    {
      key: TRAFFIC_RESTORE_PACE_KEY,
      label: "Traffic Restore Pace",
      componentId: "global-router",
      valueLabels: { hold: "Hold", gradual: "Gradual", instant: "Instant" },
    },
  ],
  components: [
    { id: "global-router", label: "Global Router" },
    { id: "region-a-api", label: "Region A API" },
    { id: "region-a-cache", label: "Region A Cache" },
    { id: "region-a-db", label: "Region A DB" },
    { id: "region-b-api", label: "Region B API" },
    { id: "region-b-cache", label: "Region B Cache" },
    { id: "region-b-db", label: "Region B DB" },
    { id: "region-c-api", label: "Region C API" },
    { id: "region-c-cache", label: "Region C Cache" },
    { id: "region-c-db", label: "Region C DB" },
  ],
};
