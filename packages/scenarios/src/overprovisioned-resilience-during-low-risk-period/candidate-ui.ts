import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKUP_FREQUENCY_KEY,
  DATABASE_REPLICA_CLASS_KEY,
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  PREWARMED_CACHE_CAPACITY_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "./controls";

export const overprovisionedResilienceDuringLowRiskPeriodCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestSuccessRate", label: "Request Success Rate", sourceStateKey: "requestSuccessRate", format: "percentage" },
    { key: "p99LatencyMs", label: "P99 Latency", sourceStateKey: "p99LatencyMs", format: "duration" },
    { key: "monthlyInfrastructureCostUsd", label: "Monthly Infrastructure Cost", sourceStateKey: "monthlyInfrastructureCostUsd", format: "currency" },
    { key: "resilienceFloorStatus", label: "Resilience Floor Status", sourceStateKey: "resilienceFloorStatus", format: "status" },
    { key: "cumulativeUnabsorbedFailoverDrillCount", label: "Unabsorbed Failover Drills (historical)", sourceStateKey: "cumulativeUnabsorbedFailoverDrillCount", format: "number" },
    { key: "costPostureStatus", label: "Cost Posture", sourceStateKey: "costPostureStatus", format: "status" },
  ],
  controls: [
    {
      key: MULTI_AZ_MODE_KEY,
      label: "Multi-AZ Mode",
      componentId: "multi-az-capacity",
      valueLabels: {
        "active-active": "Active-Active (full)",
        "single-az-with-standby": "Single-AZ with Warm Standby",
        "single-az-only": "Single-AZ Only",
      },
    },
    {
      key: FAILOVER_RESERVE_KEY,
      label: "Failover Reserve",
      componentId: "multi-az-capacity",
      valueLabels: {
        "peak-reserved": "Peak-Event Reserved",
        "baseline-reserved": "Baseline Reserved",
        none: "None",
      },
    },
    {
      key: BACKUP_FREQUENCY_KEY,
      label: "Backup Frequency",
      componentId: "database-primary",
      valueLabels: {
        "high-frequency": "High-Frequency",
        standard: "Standard",
        minimal: "Minimal",
      },
    },
    {
      key: REPLICA_COUNT_KEY,
      label: "Service Fleet Replica Count",
      componentId: "service-fleet",
      valueLabels: {
        "peak-event": "Peak-Event (3x)",
        "baseline-operating": "Baseline Operating (2x)",
        minimum: "Minimum (1x)",
      },
    },
    {
      key: WARM_CAPACITY_KEY,
      label: "Warm Capacity",
      componentId: "service-fleet",
      valueLabels: { full: "Full", reduced: "Reduced", none: "None" },
    },
    {
      key: STANDBY_FLEET_KEY,
      label: "Standby Fleet",
      componentId: "service-fleet",
      valueLabels: { full: "Full", reduced: "Reduced", none: "None" },
    },
    {
      key: DATABASE_REPLICA_CLASS_KEY,
      label: "Database Replica Class",
      componentId: "database-primary",
      valueLabels: {
        "peak-sized": "Peak-Sized",
        "baseline-sized": "Baseline-Sized",
        undersized: "Undersized",
      },
    },
    {
      key: PREWARMED_CACHE_CAPACITY_KEY,
      label: "Prewarmed Cache Capacity",
      componentId: "read-replicas",
      valueLabels: {
        "peak-sized": "Peak-Sized",
        "baseline-sized": "Baseline-Sized",
        minimal: "Minimal",
      },
    },
  ],
  components: [
    { id: "global-router", label: "Global Router" },
    { id: "service-fleet", label: "Service Fleet" },
    { id: "multi-az-capacity", label: "Multi-AZ Capacity" },
    { id: "database-primary", label: "Database Primary" },
    { id: "read-replicas", label: "Read Replicas" },
  ],
};
