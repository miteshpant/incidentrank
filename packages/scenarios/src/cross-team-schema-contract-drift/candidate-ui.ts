import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  INSPECT_SCHEMA_DIFF_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const crossTeamSchemaContractDriftCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "schemaViolationRatePercent",
      label: "Schema Violation Rate",
      sourceStateKey: "schemaViolationRatePercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "billingDroppedEventCount",
      label: "Billing Dropped Event Count",
      sourceStateKey: "billingDroppedEventCount",
      format: "number",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "billingUnbilledRevenueUsd",
      label: "Billing Unbilled Revenue",
      sourceStateKey: "billingUnbilledRevenueUsd",
      format: "currency",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "analyticsCorruptedRowPercent",
      label: "Analytics Corrupted Row Percent",
      sourceStateKey: "analyticsCorruptedRowPercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "fraudConsumerLagSeconds",
      label: "Fraud Detection Consumer Lag",
      sourceStateKey: "fraudConsumerLagSeconds",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "fraudPodRestartCount",
      label: "Fraud Detection Pod Restart Count",
      sourceStateKey: "fraudPodRestartCount",
      format: "number",
      roleInIncident: "contributing_factor",
    },
    {
      key: "warehouseCompactionQueueDepth",
      label: "Warehouse Compaction Queue Depth",
      sourceStateKey: "warehouseCompactionQueueDepth",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_SCHEMA_DIFF_KEY,
      label: "Inspect Schema Diff",
      componentId: "orders-service",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_BILLING_ERRORS_KEY,
      label: "Inspect Billing Error Logs",
      componentId: "billing-pipeline",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_ANALYTICS_DRIFT_KEY,
      label: "Inspect Analytics Field Drift",
      componentId: "analytics-warehouse",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
      label: "Inspect Fraud Deserialization Errors",
      componentId: "fraud-detection",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
      label: "Publish Schema Compatibility Shim",
      componentId: "orders-service",
      kind: "remediation",
      valueLabels: { false: "Not published", true: "Published" },
    },
    {
      key: REDEPLOY_BILLING_MAPPER_KEY,
      label: "Redeploy Billing Field Mapper",
      componentId: "billing-pipeline",
      kind: "remediation",
      valueLabels: { false: "Not redeployed", true: "Redeployed" },
    },
    {
      key: BACKFILL_ANALYTICS_WAREHOUSE_KEY,
      label: "Backfill Analytics Warehouse",
      componentId: "analytics-warehouse",
      kind: "remediation",
      valueLabels: { false: "Not backfilled", true: "Backfilled" },
    },
    {
      key: REDEPLOY_FRAUD_DESERIALIZER_KEY,
      label: "Redeploy Fraud Deserializer",
      componentId: "fraud-detection",
      kind: "remediation",
      valueLabels: { false: "Not redeployed", true: "Redeployed" },
    },
    {
      key: RESTART_FRAUD_DETECTION_PODS_KEY,
      label: "Restart Fraud Detection Pods",
      componentId: "fraud-detection",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
  ],
  components: [
    { id: "orders-service", label: "Orders Service (producer)" },
    { id: "event-bus", label: "Event Bus" },
    { id: "billing-pipeline", label: "Billing Pipeline" },
    { id: "analytics-warehouse", label: "Analytics Warehouse" },
    { id: "fraud-detection", label: "Fraud Detection Pipeline" },
  ],
};
