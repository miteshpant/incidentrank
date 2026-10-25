import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AD_HOC_ACCESS_POLICY_KEY,
  AD_HOC_QUERY_CAP_KEY,
  ADMISSION_POLICY_KEY,
  DEADLINE_COMMUNICATION_KEY,
  LONG_RUNNING_QUERY_POLICY_KEY,
  WAREHOUSE_CAPACITY_TIER_KEY,
} from "./controls";

export const analyticsWarehouseQueryContentionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "adHocConcurrentQueries", label: "Ad-Hoc Concurrent Queries", sourceStateKey: "adHocConcurrentQueries", format: "number" },
    { key: "adHocQueuedQueries", label: "Ad-Hoc Queued Queries", sourceStateKey: "adHocQueuedQueries", format: "number" },
    { key: "reportDeadlineMinutesRemaining", label: "Report Deadline Remaining", sourceStateKey: "reportDeadlineMinutesRemaining", format: "duration" },
    { key: "reportQueueWaitMinutes", label: "Report Queue Wait", sourceStateKey: "reportQueueWaitMinutes", format: "duration" },
    { key: "reportOnTrackForSla", label: "Report On Track For SLA", sourceStateKey: "reportOnTrackForSla", format: "status" },
    { key: "dataScienceJobUncheckpointedMinutes", label: "DS Job Uncheckpointed Minutes", sourceStateKey: "dataScienceJobUncheckpointedMinutes", format: "duration" },
    { key: "dataScienceLostWorkHoursCumulative", label: "DS Lost Work Hours (historical)", sourceStateKey: "dataScienceLostWorkHoursCumulative", format: "number" },
    { key: "warehouseUtilizationPercent", label: "Warehouse Utilization", sourceStateKey: "warehouseUtilizationPercent", format: "percentage" },
    { key: "queryLatencyP95Seconds", label: "Query Latency P95", sourceStateKey: "queryLatencyP95Seconds", format: "duration" },
    { key: "adHocAccessAvailabilityPercent", label: "Ad-Hoc Access Availability", sourceStateKey: "adHocAccessAvailabilityPercent", format: "percentage" },
    { key: "slaStatus", label: "SLA Status", sourceStateKey: "slaStatus", format: "status" },
    { key: "workloadTradeoffStatus", label: "Workload Tradeoff Status", sourceStateKey: "workloadTradeoffStatus", format: "status" },
  ],
  controls: [
    {
      key: ADMISSION_POLICY_KEY,
      label: "Admission Policy",
      componentId: "query-gateway",
      valueLabels: { fifo: "FIFO (arrival order)", "priority-queue": "Priority Queue (critical jobs first)" },
    },
    {
      key: AD_HOC_QUERY_CAP_KEY,
      label: "Ad-Hoc Query Cap",
      componentId: "query-gateway",
      valueLabels: { unlimited: "Unlimited", capped: "Capped (bounded concurrency)" },
    },
    {
      key: LONG_RUNNING_QUERY_POLICY_KEY,
      label: "Long-Running Query Policy",
      componentId: "data-science",
      valueLabels: { allow: "Allow to Completion", "graceful-stop": "Graceful Stop (checkpoint first)", "hard-kill": "Hard Kill (immediate)" },
    },
    {
      key: AD_HOC_ACCESS_POLICY_KEY,
      label: "Ad-Hoc Access Policy",
      componentId: "query-gateway",
      valueLabels: { open: "Open", revoked: "Revoked (block all ad-hoc access)" },
    },
    {
      key: WAREHOUSE_CAPACITY_TIER_KEY,
      label: "Warehouse Capacity Tier",
      componentId: "warehouse",
      valueLabels: { standard: "Standard", scaled: "Scaled (more compute)" },
    },
    {
      key: DEADLINE_COMMUNICATION_KEY,
      label: "Report Deadline Communication",
      componentId: "scheduled-reports",
      valueLabels: { silent: "Silent", "proactive-notice": "Proactive Notice" },
    },
  ],
  components: [
    { id: "bi-users", label: "BI Users" },
    { id: "data-science", label: "Data Science" },
    { id: "scheduled-reports", label: "Scheduled Reports" },
    { id: "query-gateway", label: "Query Gateway" },
    { id: "warehouse", label: "Warehouse" },
  ],
};
