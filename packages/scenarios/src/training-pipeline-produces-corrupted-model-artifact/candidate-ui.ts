import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
  VALIDATION_COMPUTE_TIER_KEY,
} from "./controls";

export const trainingPipelineProducesCorruptedModelArtifactCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "trainingPipelineSuccessRate", label: "Training Pipeline Success Rate", sourceStateKey: "trainingPipelineSuccessRate", format: "percentage" },
    { key: "deploymentPipelineUptimePercent", label: "Deployment Pipeline Uptime", sourceStateKey: "deploymentPipelineUptimePercent", format: "percentage" },
    { key: "artifactValidationScore", label: "Artifact Validation Score", sourceStateKey: "artifactValidationScore", format: "number" },
    { key: "modelOutputErrorRatePercent", label: "Model Output Error Rate", sourceStateKey: "modelOutputErrorRatePercent", format: "percentage" },
    { key: "currentServingArtifactTrustStatus", label: "Serving Artifact Trust Status", sourceStateKey: "currentServingArtifactTrustStatus", format: "status" },
    { key: "promotionGateStatus", label: "Promotion Gate Status", sourceStateKey: "promotionGateStatus", format: "status" },
    { key: "lineageAuditStatus", label: "Lineage Audit Status", sourceStateKey: "lineageAuditStatus", format: "status" },
    { key: "cumulativeDecisionsOnCorruptedModel", label: "Cumulative Decisions On Corrupted Model (historical)", sourceStateKey: "cumulativeDecisionsOnCorruptedModel", format: "number" },
    { key: "artifactRiskStatus", label: "Artifact Risk Status", sourceStateKey: "artifactRiskStatus", format: "status" },
  ],
  controls: [
    {
      key: SERVING_ARTIFACT_ACTION_KEY,
      label: "Serving Artifact Action",
      componentId: "deployment-pipeline",
      valueLabels: { "keep-serving": "Keep Serving", quarantine: "Quarantine (Pull From Serving)" },
    },
    {
      key: ROLLBACK_TARGET_KEY,
      label: "Rollback Target",
      componentId: "model-registry",
      valueLabels: { none: "None", "last-known-good": "Last-Known-Good Artifact", "hold-for-retrain": "Hold For Retrain" },
    },
    {
      key: PROMOTION_GATE_KEY,
      label: "Promotion Gate Mode",
      componentId: "model-registry",
      valueLabels: { "shallow-check": "Shallow Check Only", "trust-validation": "Trust Validation Required" },
    },
    {
      key: DISTRUST_MARKING_KEY,
      label: "Distrust Marking",
      componentId: "model-registry",
      valueLabels: { untouched: "Untouched", "quarantine-mark-distrusted": "Mark Explicitly Distrusted" },
    },
    {
      key: LINEAGE_RECORD_ACTION_KEY,
      label: "Lineage Record Action",
      componentId: "model-registry",
      valueLabels: { preserve: "Preserve Full Record", "delete-and-overwrite": "Delete And Overwrite" },
    },
    {
      key: RETRAIN_DATA_VALIDATION_KEY,
      label: "Retrain Data Validation",
      componentId: "training-data",
      valueLabels: { skip: "Skip", "validate-before-retrain": "Validate Before Retrain" },
    },
    {
      key: VALIDATION_COMPUTE_TIER_KEY,
      label: "Validation Compute Tier",
      componentId: "trainer",
      valueLabels: { standard: "Standard", heavy: "Heavy" },
    },
  ],
  components: [
    { id: "training-data", label: "Training Data" },
    { id: "feature-builder", label: "Feature Builder" },
    { id: "trainer", label: "Trainer" },
    { id: "model-registry", label: "Model Registry" },
    { id: "deployment-pipeline", label: "Deployment Pipeline" },
  ],
};
