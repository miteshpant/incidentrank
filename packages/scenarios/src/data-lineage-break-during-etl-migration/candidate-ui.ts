import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  CUTOVER_AUDIT_LOG_KEY,
  CUTOVER_STRATEGY_KEY,
  LEGACY_PATH_DECOMMISSION_KEY,
  LINEAGE_FLAGGING_KEY,
  RECONCILIATION_DEPTH_KEY,
  REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
} from "./controls";

export const dataLineageBreakDuringEtlMigrationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "sourcesAvailabilityPercent", label: "Sources Availability", sourceStateKey: "sourcesAvailabilityPercent", format: "percentage" },
    { key: "warehouseWriteSuccessRate", label: "Warehouse Write Success Rate", sourceStateKey: "warehouseWriteSuccessRate", format: "percentage" },
    { key: "reportGenerationSuccessRate", label: "Report Generation Success Rate", sourceStateKey: "reportGenerationSuccessRate", format: "percentage" },
    { key: "sourcesCutOverCount", label: "Sources Cut Over to v2", sourceStateKey: "sourcesCutOverCount", format: "number" },
    { key: "sourcesTotalCount", label: "Total Sources", sourceStateKey: "sourcesTotalCount", format: "number" },
    { key: "sourcesInInconsistentStateCount", label: "Sources Currently Transitioning", sourceStateKey: "sourcesInInconsistentStateCount", format: "number" },
    { key: "metricsWithMixedLineagePercent", label: "Metrics With Mixed Lineage", sourceStateKey: "metricsWithMixedLineagePercent", format: "percentage" },
    { key: "lineageConsistencyStatus", label: "Lineage Consistency Status", sourceStateKey: "lineageConsistencyStatus", format: "status" },
    { key: "cutoverAuditability", label: "Cutover Auditability", sourceStateKey: "cutoverAuditability", format: "status" },
    { key: "reportGateStatus", label: "Report Gate Status", sourceStateKey: "reportGateStatus", format: "status" },
    { key: "legacyPathAvailability", label: "ETL v1 Availability", sourceStateKey: "legacyPathAvailability", format: "status" },
    { key: "reportsServedWhileInconsistentCount", label: "Reports Served While Inconsistent (historical)", sourceStateKey: "reportsServedWhileInconsistentCount", format: "number" },
    { key: "migrationStatus", label: "Migration Status", sourceStateKey: "migrationStatus", format: "status" },
  ],
  controls: [
    {
      key: CUTOVER_STRATEGY_KEY,
      label: "Cutover Strategy",
      componentId: "etl-v2",
      valueLabels: {
        "not-yet-decided": "Not Yet Decided",
        "global-flip": "Global Flip (all sources at once)",
        "staged-per-source": "Staged Per-Source",
        "dual-write-reconcile": "Dual-Write + Reconcile",
      },
    },
    {
      key: LINEAGE_FLAGGING_KEY,
      label: "Lineage Flagging",
      componentId: "metrics-layer",
      valueLabels: { false: "Off", true: "Flag Inconsistent Lineage" },
    },
    {
      key: REPORT_GATE_ON_INCONSISTENT_LINEAGE_KEY,
      label: "Report Gate On Inconsistent Lineage",
      componentId: "reports",
      valueLabels: { false: "Off", true: "Gate Reports Until Lineage Consistent" },
    },
    {
      key: CUTOVER_AUDIT_LOG_KEY,
      label: "Cutover Audit Log",
      componentId: "etl-v2",
      valueLabels: { false: "Off", true: "Record Per-Source Cutover Steps" },
    },
    {
      key: RECONCILIATION_DEPTH_KEY,
      label: "Reconciliation Depth",
      componentId: "etl-v1",
      valueLabels: { shallow: "Shallow (row counts/checksums)", full: "Full (field-by-field values)" },
    },
    {
      key: LEGACY_PATH_DECOMMISSION_KEY,
      label: "Legacy Path Decommission",
      componentId: "etl-v1",
      valueLabels: { "keep-both": "Keep Both Paths", "decommission-v1": "Decommission ETL v1" },
    },
  ],
  components: [
    { id: "sources", label: "Sources" },
    { id: "etl-v1", label: "ETL v1" },
    { id: "etl-v2", label: "ETL v2" },
    { id: "warehouse", label: "Warehouse" },
    { id: "metrics-layer", label: "Metrics Layer" },
    { id: "reports", label: "Reports" },
  ],
};
