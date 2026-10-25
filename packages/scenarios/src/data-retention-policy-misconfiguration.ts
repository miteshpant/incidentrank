import type { ScenarioDefinition } from "./types";
import {
  dataRetentionPolicyMisconfigurationSimulation,
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
} from "./data-retention-policy-misconfiguration/definition";
import { dataRetentionPolicyMisconfigurationCandidateUI } from "./data-retention-policy-misconfiguration/candidate-ui";
import { DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING } from "./data-retention-policy-misconfiguration/scoring";

/**
 * Data Retention Policy Misconfiguration — a paid, Principal-level
 * IncidentRank scenario (Phase 6E.3's secondary flagship). The Deletion
 * Service's most recent retention-policy rollout is misconfigured:
 * Financial Records that must be retained for the mandated 7-year
 * window (or are under active legal hold) are being wrongly purged from
 * the Archive. Application uptime and Event Store write success stay
 * green throughout — this is a COMPLIANCE-CORRECTNESS problem, not an
 * availability problem, and availability is deliberately treated as
 * secondary throughout this scenario's design.
 */
export const dataRetentionPolicyMisconfiguration: ScenarioDefinition = {
  id: "data-retention-policy-misconfiguration",
  slug: "data-retention-policy-misconfiguration",
  version: 1,
  name: "Data Retention Policy Misconfiguration",
  description:
    "The Deletion Service's most recent retention-policy rollout is misconfigured: Financial Records that must be retained for the mandated 7-year window — or are under active legal hold — are being wrongly purged from the Archive. Application uptime and Event Store write success remain fully healthy throughout; nothing here is an availability incident. Four business invariants govern every decision: (1) data under legal hold or mandated retention must never be deleted, regardless of what the misconfigured policy currently says; (2) data past its own mandated deletion deadline must not be retained indefinitely merely because fixing deletion feels riskier than doing nothing; (3) different data classes — Financial Records, User-Deletion-Request data, Ephemeral Logs — have genuinely different retention requirements and must never be treated uniformly; (4) once a record is wrongly deleted, that loss is permanent and irreversible, not a recoverable backlog state. Decide whether to correct the retention policy for the specific data class that is actually broken, whether to enforce legal holds independently of the policy itself, whether to audit affected records before or after applying the fix, whether to validate the correction against a sample before rolling it to production, and — critically — whether a fleet-wide emergency halt of all deletion is the cautious response it looks like, or a trap that creates a second, unrelated violation on a data class that was never part of the problem.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  simulation: dataRetentionPolicyMisconfigurationSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Compliance",
      "Data Retention",
      "Legal Hold",
      "Data Governance",
      "Historical Damage",
      "Policy Correctness",
    ],
    skills: [
      "Distinguishing availability health from compliance correctness",
      "Scoping a corrective fix to the data class actually broken, not every class",
      "Recognizing that a maximally-cautious-looking response can create a new violation",
      "Sequencing investigation/audit against a corrective action under real business risk",
    ],
    shortDescription:
      "A misconfigured retention policy is wrongly deleting Financial Records while every availability dashboard stays green — pausing all deletion looks safe but breaches an unrelated data class's own deletion deadline.",
  },
};

export {
  dataRetentionPolicyMisconfigurationSimulation,
  dataRetentionPolicyMisconfigurationCandidateUI,
  DATA_RETENTION_POLICY_MISCONFIGURATION_SCORING,
  AUDIT_SEQUENCING_KEY,
  DELETION_POLICY_MODE_KEY,
  EMERGENCY_HALT_ALL_DELETION_KEY,
  EPHEMERAL_LOG_PURGE_KEY,
  FIX_ROLLOUT_MODE_KEY,
  LEGAL_HOLD_ENFORCEMENT_KEY,
  USER_DELETION_REQUEST_PROCESSING_KEY,
};
