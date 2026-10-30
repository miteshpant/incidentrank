import type { ScenarioDefinition } from "./types";
import {
  privacyDeletionBacklogSimulation,
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
} from "./privacy-deletion-backlog/definition";
import { privacyDeletionBacklogCandidateUI } from "./privacy-deletion-backlog/candidate-ui";
import { PRIVACY_DELETION_BACKLOG_SCORING } from "./privacy-deletion-backlog/scoring";

/**
 * Privacy Deletion Backlog — a paid, Senior-Staff-level IncidentRank
 * scenario (Phase 6E.4). User deletion requests are being accepted
 * successfully by the Privacy API, but downstream deletion execution
 * across the Workflow Queue's fan-out (Product Databases, Analytics
 * Store, Backup Index) is falling behind. Request acceptance stays
 * green throughout — this is an EXECUTION-COMPLETENESS problem, not an
 * availability problem, and the central lesson is distinguishing
 * "request accepted" from "deletion actually completed."
 */
export const privacyDeletionBacklog: ScenarioDefinition = {
  id: "privacy-deletion-backlog",
  slug: "privacy-deletion-backlog",
  version: 1,
  name: "Privacy Deletion Backlog",
  description:
    "User deletion requests are being accepted successfully by the Privacy API, but downstream deletion execution across the Workflow Queue's fan-out — Product Databases, Analytics Store, and Backup Index — is falling behind. Request acceptance stays fully healthy throughout; nothing here is an availability incident. Five business invariants govern every decision: (1) every accepted deletion request must eventually complete across every required downstream system; (2) a request must never be marked complete while a required downstream store still holds the data; (3) regulatory and policy deletion deadlines are real and candidate-visible, and must never be silently breached by a 'process the easiest requests first' strategy; (4) the most legally sensitive, highest-risk requests may be prioritized, but prioritizing them is only real once it is actually engaged, not merely selected; (5) backups and indexes may lag the live stores on their own rotation schedule — that is an acceptable difference in semantics — but that lag must always be explicitly tracked and reported, never hidden. Decide how deletion requests are marked complete (on acceptance, or only once genuinely verified across every required store), how the backlog is prioritized (newest-first, oldest-deadline-first, or high-risk-first), whether to additionally boost high-risk requests, whether the Analytics Store and Backup Index are treated with the same rigor as Product Databases, and how much worker/retry capacity to commit to draining the backlog — and, critically, whether marking requests complete the instant they're accepted is a reasonable way to keep the dashboard moving, or a trap that quietly falsifies the system's own audit trail.",
  difficulty: "senior_staff",
  estimatedMinutes: 22,
  isFree: false,
  structure: "linear",
  simulation: privacyDeletionBacklogSimulation,
  library: {
    category: "Data Pipelines",
    tags: [
      "Privacy",
      "Data Deletion",
      "Compliance",
      "Auditability",
      "Historical Damage",
      "Execution Completeness",
    ],
    skills: [
      "Distinguishing request acceptance from genuine end-to-end execution completeness",
      "Recognizing a false-complete state that looks identical to a real completion on every dashboard",
      "Prioritizing a backlog against real regulatory deadlines without starving the oldest requests",
      "Treating every required downstream system with equal rigor, never silently dropping one",
    ],
    shortDescription:
      "Deletion requests are accepted successfully while downstream execution falls behind across three stores — marking a request complete before every store has actually finished creates a false completion that looks identical to a real one.",
  },
};

export {
  privacyDeletionBacklogSimulation,
  privacyDeletionBacklogCandidateUI,
  PRIVACY_DELETION_BACKLOG_SCORING,
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
};
