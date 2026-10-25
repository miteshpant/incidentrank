import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./controls";

export const runawayCloudSpendDuringHealthyTrafficCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestLatencyP99Ms", label: "Request Latency (p99)", sourceStateKey: "requestLatencyP99Ms", format: "duration" },
    { key: "errorRatePercent", label: "Error Rate", sourceStateKey: "errorRatePercent", format: "percentage" },
    { key: "requestsPerSecond", label: "Requests per Second", sourceStateKey: "requestsPerSecond", format: "number" },
    { key: "runningInstanceCount", label: "Running Instance Count", sourceStateKey: "runningInstanceCount", format: "number" },
    { key: "workerUtilizationPercent", label: "Worker Utilization", sourceStateKey: "workerUtilizationPercent", format: "percentage" },
    { key: "databaseUtilizationPercent", label: "Database Utilization", sourceStateKey: "databaseUtilizationPercent", format: "percentage" },
    { key: "objectStoreEgressGbPerHour", label: "Object Store Egress", sourceStateKey: "objectStoreEgressGbPerHour", format: "number" },
    { key: "costPerMinuteUsd", label: "Cost per Minute", sourceStateKey: "costPerMinuteUsd", format: "currency" },
    { key: "costPerRequestUsd", label: "Cost per Request", sourceStateKey: "costPerRequestUsd", format: "currency" },
    { key: "redundancyHeadroomStatus", label: "Redundancy Headroom", sourceStateKey: "redundancyHeadroomStatus", format: "status" },
    { key: "cumulativeHeadroomBreachSeconds", label: "Cumulative Headroom Breach Time (seconds)", sourceStateKey: "cumulativeHeadroomBreachSeconds", format: "number" },
    { key: "costSafetyStatus", label: "Cost Safety Status", sourceStateKey: "costSafetyStatus", format: "status" },
  ],
  controls: [
    {
      key: AUTOSCALER_TARGET_UTILIZATION_KEY,
      label: "Autoscaler Target Utilization",
      componentId: "autoscaler",
      valueLabels: { "30": "Conservative (30%)", "55": "Balanced (55%)", "80": "Aggressive (80%)" },
    },
    {
      key: MIN_REPLICA_COUNT_KEY,
      label: "Minimum Replica Count",
      componentId: "autoscaler",
      valueLabels: { "2": "2 (below safety floor)", "6": "6 (safety floor)", "40": "40 (leftover)" },
    },
    {
      key: WORKER_INSTANCE_CLASS_KEY,
      label: "Worker Instance Class",
      componentId: "worker-fleet",
      valueLabels: { economy: "Economy", standard: "Standard", large: "Large" },
    },
    {
      key: REQUEST_BATCHING_MODE_KEY,
      label: "Request Batching Mode",
      componentId: "api",
      valueLabels: { disabled: "Disabled", adaptive: "Adaptive", aggressive: "Aggressive" },
    },
    {
      key: WARM_POOL_SIZE_KEY,
      label: "Warm Pool Size",
      componentId: "worker-fleet",
      valueLabels: { "0": "None", "4": "Lean (4)", "20": "Generous (20)" },
    },
    {
      key: IDLE_CAPACITY_POLICY_KEY,
      label: "Idle Capacity Policy",
      componentId: "worker-fleet",
      valueLabels: {
        "keep-warm": "Keep Warm",
        "scale-to-min": "Scale to Min",
        "scale-to-floor-minus-two": "Scale to Floor Minus Two",
      },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "autoscaler", label: "Autoscaler" },
    { id: "worker-fleet", label: "Worker Fleet" },
    { id: "database", label: "Database" },
    { id: "object-store", label: "Object Store" },
  ],
};
