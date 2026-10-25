import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CONTINGENCY_RESERVE_KEY,
  FORECAST_CONFIDENCE_THRESHOLD_KEY,
  ON_DEMAND_FALLBACK_POLICY_KEY,
  OPTIONAL_WORKLOAD_SHEDDING_KEY,
  RESERVATION_TIMING_KEY,
  RESERVED_CAPACITY_REGION_A_KEY,
  RESERVED_CAPACITY_REGION_B_KEY,
  RESERVED_CAPACITY_REGION_C_KEY,
} from "./controls";

export const emergencyCapacityReservationDecisionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "demandForecastP50Units", label: "Demand Forecast (p50)", sourceStateKey: "demandForecastP50Units", format: "number" },
    { key: "demandForecastP90Units", label: "Demand Forecast (p90)", sourceStateKey: "demandForecastP90Units", format: "number" },
    { key: "demandForecastP99Units", label: "Demand Forecast (p99)", sourceStateKey: "demandForecastP99Units", format: "number" },
    { key: "reservedCapacityTotalUnits", label: "Reserved Capacity (total)", sourceStateKey: "reservedCapacityTotalUnits", format: "number" },
    { key: "onDemandExposureUnits", label: "On-Demand Exposure", sourceStateKey: "onDemandExposureUnits", format: "number" },
    { key: "wastedReservedCapacityUnits", label: "Wasted Reserved Capacity", sourceStateKey: "wastedReservedCapacityUnits", format: "number" },
    { key: "cumulativeDeadlineMissExposureUnits", label: "Cumulative Deadline-Miss Exposure", sourceStateKey: "cumulativeDeadlineMissExposureUnits", format: "number" },
    { key: "criticalWorkloadProtectionStatus", label: "Critical-Tier Workload Protection", sourceStateKey: "criticalWorkloadProtectionStatus", format: "status" },
    { key: "regionalConcentrationStatus", label: "Regional Concentration Status", sourceStateKey: "regionalConcentrationStatus", format: "status" },
    { key: "reservationDecisionStatus", label: "Reservation Decision Status", sourceStateKey: "reservationDecisionStatus", format: "status" },
    { key: "reservationWasteStatus", label: "Reservation Waste Status", sourceStateKey: "reservationWasteStatus", format: "status" },
  ],
  controls: [
    {
      key: RESERVED_CAPACITY_REGION_A_KEY,
      label: "Reserved Capacity — Region A",
      componentId: "region-a",
      valueLabels: { "0": "None", "300": "Low (300 units)", "600": "Moderate (600 units)", "900": "High (900 units)" },
    },
    {
      key: RESERVED_CAPACITY_REGION_B_KEY,
      label: "Reserved Capacity — Region B",
      componentId: "region-b",
      valueLabels: { "0": "None", "300": "Low (300 units)", "600": "Moderate (600 units)", "900": "High (900 units)" },
    },
    {
      key: RESERVED_CAPACITY_REGION_C_KEY,
      label: "Reserved Capacity — Region C",
      componentId: "region-c",
      valueLabels: { "0": "None", "300": "Low (300 units)", "600": "Moderate (600 units)", "900": "High (900 units)" },
    },
    {
      key: ON_DEMAND_FALLBACK_POLICY_KEY,
      label: "On-Demand Fallback Policy",
      componentId: "on-demand-capacity",
      valueLabels: { disabled: "Disabled", enabled: "Enabled (bounded burst capacity)" },
    },
    {
      key: OPTIONAL_WORKLOAD_SHEDDING_KEY,
      label: "Optional-Workload Shedding",
      componentId: "capacity-planner",
      valueLabels: { none: "None (treat all workload identically)", "shed-under-pressure": "Shed Optional-Tier Under Pressure" },
    },
    {
      key: FORECAST_CONFIDENCE_THRESHOLD_KEY,
      label: "Forecast Confidence Threshold",
      componentId: "demand-forecasting",
      valueLabels: { "p50-only": "Plan to p50 (median) Only", "p90-planning": "Plan to p90", "p99-planning": "Plan to p99 (near-worst-case)" },
    },
    {
      key: RESERVATION_TIMING_KEY,
      label: "Reservation Timing",
      componentId: "capacity-planner",
      valueLabels: { wait: "Wait", "lock-in-now": "Lock In Now" },
    },
    {
      key: CONTINGENCY_RESERVE_KEY,
      label: "Contingency Reserve",
      componentId: "reserved-capacity",
      valueLabels: { none: "None", small: "Small Buffer", large: "Large Buffer" },
    },
  ],
  components: [
    { id: "demand-forecasting", label: "Demand Forecasting" },
    { id: "capacity-planner", label: "Capacity Planner" },
    { id: "region-a", label: "Region A" },
    { id: "region-b", label: "Region B" },
    { id: "region-c", label: "Region C" },
    { id: "reserved-capacity", label: "Reserved Capacity" },
    { id: "on-demand-capacity", label: "On-Demand Capacity" },
  ],
};
