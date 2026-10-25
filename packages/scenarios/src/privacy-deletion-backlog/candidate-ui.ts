import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
} from "./controls";

export const privacyDeletionBacklogCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "requestAcceptanceSuccessRate", label: "Request Acceptance Success Rate", sourceStateKey: "requestAcceptanceSuccessRate", format: "percentage" },
    { key: "deletionBacklogCount", label: "Deletion Backlog (incomplete requests)", sourceStateKey: "deletionBacklogCount", format: "number" },
    { key: "oldestRequestAgeDays", label: "Oldest Incomplete Request Age (days)", sourceStateKey: "oldestRequestAgeDays", format: "number" },
    { key: "endToEndCompletionPercent", label: "End-to-End Completion Rate", sourceStateKey: "endToEndCompletionPercent", format: "percentage" },
    { key: "productDbCompletionPercent", label: "Product Databases Completion", sourceStateKey: "productDbCompletionPercent", format: "percentage" },
    { key: "analyticsStoreCompletionPercent", label: "Analytics Store Completion", sourceStateKey: "analyticsStoreCompletionPercent", format: "percentage" },
    { key: "backupIndexCompletionPercent", label: "Backup Index Completion", sourceStateKey: "backupIndexCompletionPercent", format: "percentage" },
    { key: "deadlineRiskCount", label: "Requests at Deadline Risk", sourceStateKey: "deadlineRiskCount", format: "number" },
    { key: "falseCompletionCount", label: "False Completions (cumulative)", sourceStateKey: "falseCompletionCount", format: "number" },
    { key: "deadlineBreachedCount", label: "Deadline Breaches (cumulative)", sourceStateKey: "deadlineBreachedCount", format: "number" },
    { key: "deletionWorkflowStatus", label: "Deletion Workflow Status", sourceStateKey: "deletionWorkflowStatus", format: "status" },
    { key: "backupIndexTrackingStatus", label: "Backup Index Tracking Status", sourceStateKey: "backupIndexTrackingStatus", format: "status" },
  ],
  controls: [
    {
      key: COMPLETION_MARKING_POLICY_KEY,
      label: "Completion Marking Policy",
      componentId: "workflow-queue",
      valueLabels: { "mark-on-accept": "Mark Complete on Accept (current)", "mark-on-verified-complete": "Mark Complete Only When Verified" },
    },
    {
      key: QUEUE_PRIORITY_POLICY_KEY,
      label: "Queue Priority Policy",
      componentId: "workflow-queue",
      valueLabels: {
        "newest-first": "Newest Requests First",
        "oldest-deadline-first": "Oldest / Deadline-Nearest First",
        "high-risk-first": "High-Risk / Legal-Class First",
      },
    },
    {
      key: HIGH_RISK_PRIORITY_BOOST_KEY,
      label: "High-Risk Priority Boost",
      componentId: "workflow-queue",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: DELETION_WORKER_ALLOCATION_KEY,
      label: "Deletion Worker Allocation",
      componentId: "workflow-queue",
      valueLabels: { baseline: "Baseline", "scaled-up": "Scaled Up" },
    },
    {
      key: ANALYTICS_STORE_PROCESSING_KEY,
      label: "Analytics Store Processing",
      componentId: "analytics-store",
      valueLabels: { enforced: "Enforced", skipped: "Skipped" },
    },
    {
      key: BACKUP_INDEX_PROCESSING_MODE_KEY,
      label: "Backup Index Processing Mode",
      componentId: "backup-index",
      valueLabels: { "tracked-pending": "Tracked (Pending Allowed)", "excluded-from-completion": "Excluded From Tracking" },
    },
    {
      key: RETRY_POLICY_KEY,
      label: "Retry Policy",
      componentId: "workflow-queue",
      valueLabels: { standard: "Standard", aggressive: "Aggressive" },
    },
  ],
  components: [
    { id: "deletion-requests", label: "Deletion Requests" },
    { id: "privacy-api", label: "Privacy API" },
    { id: "workflow-queue", label: "Workflow Queue" },
    { id: "product-databases", label: "Product Databases" },
    { id: "analytics-store", label: "Analytics Store" },
    { id: "backup-index", label: "Backup Index" },
  ],
};
