import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
} from "./controls";

export const dataRetentionPolicyMisconfigurationCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "applicationUptimePercent", label: "Application Uptime", sourceStateKey: "applicationUptimePercent", format: "percentage" },
    { key: "eventStoreWriteSuccessRate", label: "Event Store Write Success Rate", sourceStateKey: "eventStoreWriteSuccessRate", format: "percentage" },
    { key: "financialRecordsWronglyDeletedCount", label: "Financial Records Wrongly Deleted (cumulative)", sourceStateKey: "financialRecordsWronglyDeletedCount", format: "number" },
    { key: "financialRecordsComplianceRatePercent", label: "Financial Records Compliance Rate", sourceStateKey: "financialRecordsComplianceRatePercent", format: "percentage" },
    { key: "financialRecordsRetentionStatus", label: "Financial Records Retention Status", sourceStateKey: "financialRecordsRetentionStatus", format: "status" },
    { key: "userDeletionRequestOverdueCount", label: "User-Deletion-Requests Overdue (cumulative)", sourceStateKey: "userDeletionRequestOverdueCount", format: "number" },
    { key: "userDeletionRequestComplianceRatePercent", label: "User-Deletion-Request Compliance Rate", sourceStateKey: "userDeletionRequestComplianceRatePercent", format: "percentage" },
    { key: "userDeletionRequestRetentionStatus", label: "User-Deletion-Request Retention Status", sourceStateKey: "userDeletionRequestRetentionStatus", format: "status" },
    { key: "ephemeralLogExcessStorageGb", label: "Ephemeral Log Excess Storage", sourceStateKey: "ephemeralLogExcessStorageGb", format: "number" },
    { key: "affectedRecordAuditStatus", label: "Affected-Record Audit Status", sourceStateKey: "affectedRecordAuditStatus", format: "status" },
    { key: "correctionValidationStatus", label: "Correction Validation Status", sourceStateKey: "correctionValidationStatus", format: "status" },
  ],
  controls: [
    {
      key: DELETION_POLICY_MODE_KEY,
      label: "Deletion Policy Mode",
      componentId: "deletion-service",
      valueLabels: { misconfigured: "Misconfigured (current rollout)", "financial-class-corrected": "Financial Records Class Corrected" },
    },
    {
      key: LEGAL_HOLD_ENFORCEMENT_KEY,
      label: "Legal Hold Enforcement",
      componentId: "archive",
      valueLabels: { unenforced: "Unenforced", enforced: "Enforced (block purge on hold)" },
    },
    {
      key: EMERGENCY_HALT_ALL_DELETION_KEY,
      label: "Emergency Halt (All Classes)",
      componentId: "deletion-service",
      valueLabels: { off: "Off", "all-classes-paused": "Pause Deletion — All Data Classes" },
    },
    {
      key: USER_DELETION_REQUEST_PROCESSING_KEY,
      label: "User-Deletion-Request Processing",
      componentId: "data-lake",
      valueLabels: { enforced: "Enforced", suspended: "Suspended" },
    },
    {
      key: EPHEMERAL_LOG_PURGE_KEY,
      label: "Ephemeral Log Purge",
      componentId: "data-lake",
      valueLabels: { enforced: "Enforced", suspended: "Suspended" },
    },
    {
      key: AUDIT_SEQUENCING_KEY,
      label: "Audit Sequencing",
      componentId: "application",
      valueLabels: { "fix-immediately": "Fix Immediately", "audit-first": "Audit Affected Records First" },
    },
    {
      key: FIX_ROLLOUT_MODE_KEY,
      label: "Fix Rollout Mode",
      componentId: "deletion-service",
      valueLabels: { "direct-to-production": "Direct to Production", "validate-first": "Validate Against Sample First" },
    },
  ],
  components: [
    { id: "application", label: "Application" },
    { id: "event-store", label: "Event Store" },
    { id: "data-lake", label: "Data Lake" },
    { id: "archive", label: "Archive" },
    { id: "deletion-service", label: "Deletion Service" },
  ],
};
