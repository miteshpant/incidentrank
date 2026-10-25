import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
  DUPLICATE_HANDLING_KEY,
  FALLBACK_EVIDENCE_SOURCE_KEY,
  IMMUTABLE_STORE_POLICY_KEY,
  INGESTION_PAUSE_KEY,
  ORDERING_RECONSTRUCTION_KEY,
  RECONCILIATION_MODE_KEY,
  REPORT_PUBLICATION_MODE_KEY,
} from "./controls";

export const auditLogIntegrityFailureCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "servicesUptimePercent", label: "Services Uptime", sourceStateKey: "servicesUptimePercent", format: "percentage" },
    { key: "auditLoggerWriteSuccessRate", label: "Audit Logger Write Success Rate", sourceStateKey: "auditLoggerWriteSuccessRate", format: "percentage" },
    { key: "eventCompletenessPercent", label: "Event Completeness", sourceStateKey: "eventCompletenessPercent", format: "percentage" },
    { key: "duplicateEventRate", label: "Duplicate Event Rate", sourceStateKey: "duplicateEventRate", format: "percentage" },
    { key: "orderingConfidencePercent", label: "Ordering Confidence", sourceStateKey: "orderingConfidencePercent", format: "percentage" },
    { key: "immutableStoreAppendSuccessRate", label: "Immutable Store Append Success Rate", sourceStateKey: "immutableStoreAppendSuccessRate", format: "percentage" },
    { key: "reconciliationBacklogCount", label: "Reconciliation Backlog", sourceStateKey: "reconciliationBacklogCount", format: "number" },
    { key: "reportTrustStatus", label: "Report Trust Status", sourceStateKey: "reportTrustStatus", format: "status" },
    { key: "tamperEvidenceStatus", label: "Tamper-Evidence Status", sourceStateKey: "tamperEvidenceStatus", format: "status" },
    { key: "unverifiableEventCount", label: "Unverifiable Events (cumulative)", sourceStateKey: "unverifiableEventCount", format: "number" },
    { key: "incorrectlyCertifiedReportCount", label: "Incorrectly Certified Reports (cumulative)", sourceStateKey: "incorrectlyCertifiedReportCount", format: "number" },
    { key: "auditGapDisclosureStatus", label: "Audit Gap Disclosure Status", sourceStateKey: "auditGapDisclosureStatus", format: "status" },
  ],
  controls: [
    {
      key: REPORT_PUBLICATION_MODE_KEY,
      label: "Report Publication Mode",
      componentId: "compliance-reports",
      valueLabels: {
        "publish-as-is": "Publish As-Is (current default)",
        "stage-until-reconciled": "Stage Until Reconciled",
        "publish-with-unverified-flag": "Publish With Unverified Flag",
      },
    },
    {
      key: RECONCILIATION_MODE_KEY,
      label: "Reconciliation Mode",
      componentId: "event-stream",
      valueLabels: { off: "Off", active: "Active" },
    },
    {
      key: DUPLICATE_HANDLING_KEY,
      label: "Duplicate Handling",
      componentId: "event-stream",
      valueLabels: { "count-as-is": "Count As-Is", "dedupe-by-fingerprint": "Dedupe By Fingerprint" },
    },
    {
      key: ORDERING_RECONSTRUCTION_KEY,
      label: "Ordering Reconstruction Mode",
      componentId: "event-stream",
      valueLabels: {
        "trust-arrival-order": "Trust Arrival Order",
        "timestamp-verified-reconstruction": "Timestamp-Verified Reconstruction",
      },
    },
    {
      key: FALLBACK_EVIDENCE_SOURCE_KEY,
      label: "Fallback Evidence Source",
      componentId: "audit-logger",
      valueLabels: { disabled: "Disabled", enabled: "Enabled" },
    },
    {
      key: INGESTION_PAUSE_KEY,
      label: "Ingestion Pause",
      componentId: "audit-logger",
      valueLabels: { off: "Off", paused: "Paused" },
    },
    {
      key: IMMUTABLE_STORE_POLICY_KEY,
      label: "Immutable Store Policy",
      componentId: "immutable-store",
      valueLabels: { "append-only": "Append-Only (enforced)", "rewrite-allowed": "Rewrite Allowed" },
    },
    {
      key: AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
      label: "Audit Gap Acknowledgement",
      componentId: "compliance-reports",
      valueLabels: { unacknowledged: "Unacknowledged", "acknowledged-and-flagged": "Acknowledged & Flagged" },
    },
  ],
  components: [
    { id: "services", label: "Services" },
    { id: "audit-logger", label: "Audit Logger" },
    { id: "event-stream", label: "Event Stream" },
    { id: "immutable-store", label: "Immutable Store" },
    { id: "compliance-reports", label: "Compliance Reports" },
  ],
};
