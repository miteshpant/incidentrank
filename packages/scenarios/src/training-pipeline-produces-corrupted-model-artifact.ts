import type { ScenarioDefinition } from "./types";
import {
  trainingPipelineProducesCorruptedModelArtifactSimulation,
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
  VALIDATION_COMPUTE_TIER_KEY,
} from "./training-pipeline-produces-corrupted-model-artifact/definition";
import { trainingPipelineProducesCorruptedModelArtifactCandidateUI } from "./training-pipeline-produces-corrupted-model-artifact/candidate-ui";
import { TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING } from "./training-pipeline-produces-corrupted-model-artifact/scoring";

/**
 * Training Pipeline Produces Corrupted Model Artifact — a paid,
 * Principal-level IncidentRank scenario (Phase 6E.3). A corrupted
 * training dataset has already produced a technically valid model
 * artifact — it trains successfully, passes basic health checks, and
 * could be deployed without a single infrastructure error occurring
 * anywhere — and that artifact is already serving live traffic. This
 * is a DATA-QUALITY/CORRECTNESS problem, not an infrastructure
 * failure: Trainer throughput and Deployment Pipeline uptime stay
 * green throughout, while the semantic correctness of every decision
 * the model makes silently degrades.
 */
export const trainingPipelineProducesCorruptedModelArtifact: ScenarioDefinition = {
  id: "training-pipeline-produces-corrupted-model-artifact",
  slug: "training-pipeline-produces-corrupted-model-artifact",
  version: 1,
  name: "Training Pipeline Produces Corrupted Model Artifact",
  description:
    "A corrupted training dataset has already produced a technically valid model artifact — it trains successfully, passes basic health checks, and could be deployed without a single infrastructure error occurring anywhere — and that artifact is already serving live production traffic. Trainer throughput and Deployment Pipeline uptime remain fully healthy throughout: this does not look like, and must not be mistaken for, an infrastructure failure. Five business invariants govern every decision here: (1) artifact promotion must require passing a real trust/validation gate before reaching Deployment Pipeline, not merely a shallow health check; (2) a model already serving must be rollback-able to a known-good prior artifact; (3) lineage — which dataset produced which artifact, which artifact is currently serving — must remain fully auditable at all times, even mid-incident; (4) corrupted artifacts must never be silently deleted or overwritten, they must be explicitly quarantined/marked distrusted instead; (5) business decisions already made using the corrupted model's output before detection are a real, permanent, non-resetting historical exposure. Decide whether to roll back immediately to a last-known-good artifact or hold promotion open for a full retrain-and-revalidation cycle, whether to harden the promotion gate so the same mistake cannot recur, and how to keep the incident's forensic record complete without ever destroying it.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: trainingPipelineProducesCorruptedModelArtifactSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "ML Platform",
      "Model Registry",
      "Artifact Promotion",
      "Lineage & Auditability",
      "Historical Damage",
      "Rollback",
    ],
    skills: [
      "Distinguishing infrastructure health from semantic model correctness",
      "Recognizing that a technically-valid artifact can still be the wrong artifact",
      "Choosing between an immediate rollback and a slower, safer retrain",
      "Preserving forensic lineage instead of deleting evidence to look clean",
    ],
    shortDescription:
      "A corrupted training dataset produced a technically valid model artifact that is already serving — deleting the evidence to clean up looks fast but destroys the forensic record for good.",
  },
};

export {
  trainingPipelineProducesCorruptedModelArtifactSimulation,
  trainingPipelineProducesCorruptedModelArtifactCandidateUI,
  TRAINING_PIPELINE_PRODUCES_CORRUPTED_MODEL_ARTIFACT_SCORING,
  DISTRUST_MARKING_KEY,
  LINEAGE_RECORD_ACTION_KEY,
  PROMOTION_GATE_KEY,
  RETRAIN_DATA_VALIDATION_KEY,
  ROLLBACK_TARGET_KEY,
  SERVING_ARTIFACT_ACTION_KEY,
  VALIDATION_COMPUTE_TIER_KEY,
};
