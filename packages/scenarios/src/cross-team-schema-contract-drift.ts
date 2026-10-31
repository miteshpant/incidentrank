import type { ScenarioDefinition } from "./types";
import {
  crossTeamSchemaContractDriftSimulation,
  INSPECT_SCHEMA_DIFF_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
} from "./cross-team-schema-contract-drift/definition";
import { crossTeamSchemaContractDriftCandidateUI } from "./cross-team-schema-contract-drift/candidate-ui";
import { CROSS_TEAM_SCHEMA_CONTRACT_DRIFT_SCORING } from "./cross-team-schema-contract-drift/scoring";

/**
 * Cross-Team Schema Contract Drift — a senior-staff, cascading-structure
 * paid scenario. Orders Service (the producing team) deploys a backward-
 * incompatible event schema change with no version negotiation. Three
 * independently-owned downstream consumer pipelines read the same event
 * stream and each breaks in a DIFFERENT way: Billing silently drops
 * events it can't map (data loss with no error spike), Analytics writes
 * corrupted rows anyway (data corruption already landed, not loss), and
 * Fraud Detection crashes on deserialization and crash-loops (the
 * loudest, most alarming signal but the smallest blast radius). The
 * candidate must triage and prioritize across all three independent
 * failures rather than fixing a single pipeline during a migration — the
 * producer-side compatibility shim stops new damage but never repairs
 * what any one consumer already lost, corrupted, or queued, so each
 * consumer additionally needs its own targeted remediation.
 */
export const crossTeamSchemaContractDrift: ScenarioDefinition = {
  id: "cross-team-schema-contract-drift",
  slug: "cross-team-schema-contract-drift",
  version: 1,
  name: "Cross-Team Schema Contract Drift Breaks Downstream Pipeline",
  description:
    "Orders Service just deployed a backward-incompatible change to its event schema, with no version negotiation. Billing, Analytics, and Fraud Detection all consume the exact same event stream — and each is now failing in a completely different way. Billing is silently dropping events it can't map, with no error spike to notice. Analytics isn't dropping anything; it's writing corrupted rows straight into the warehouse. Fraud Detection is the loudest of the three, crash-looping on deserialization failures. Fixing the producer's schema is necessary but not sufficient — it stops new damage, but repairs nothing already lost, corrupted, or queued. Triage across all three independently-owned pipelines and bring every one of them back, not just the one making the most noise.",
  difficulty: "senior_staff",
  estimatedMinutes: 25,
  isFree: false,
  structure: "cascading",
  simulation: crossTeamSchemaContractDriftSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Schema Compatibility",
      "Event Streaming",
      "Data Contracts",
      "Triage",
      "Multi-Consumer Fan-Out",
    ],
    primarySkill: "Triaging and prioritizing multiple independent downstream failures from one upstream cause",
    skills: [
      "Recognizing that a single root cause can cascade into DIFFERENT failure modes per consumer",
      "Distinguishing silent data loss from silent data corruption from loud crash-looping",
      "Understanding that a producer-side compatibility fix stops new damage but never repairs existing damage",
      "Prioritizing remediation across multiple independently-owned pipelines rather than chasing the loudest alarm",
    ],
    shortDescription:
      "One backward-incompatible schema change fans out into three downstream pipelines, each silently breaking in its own distinct way.",
  },
};

export {
  crossTeamSchemaContractDriftSimulation,
  crossTeamSchemaContractDriftCandidateUI,
  CROSS_TEAM_SCHEMA_CONTRACT_DRIFT_SCORING,
  INSPECT_SCHEMA_DIFF_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
  RESTART_FRAUD_DETECTION_PODS_KEY,
};
