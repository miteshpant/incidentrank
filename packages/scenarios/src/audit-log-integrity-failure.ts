import type { ScenarioDefinition } from "./types";
import {
  auditLogIntegrityFailureSimulation,
  AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
  DUPLICATE_HANDLING_KEY,
  FALLBACK_EVIDENCE_SOURCE_KEY,
  IMMUTABLE_STORE_POLICY_KEY,
  INGESTION_PAUSE_KEY,
  ORDERING_RECONSTRUCTION_KEY,
  RECONCILIATION_MODE_KEY,
  REPORT_PUBLICATION_MODE_KEY,
} from "./audit-log-integrity-failure/definition";
import { auditLogIntegrityFailureCandidateUI } from "./audit-log-integrity-failure/candidate-ui";
import { AUDIT_LOG_INTEGRITY_FAILURE_SCORING } from "./audit-log-integrity-failure/scoring";

/**
 * Audit Log Integrity Failure — a paid, Principal-level IncidentRank
 * scenario. Application traffic is fully healthy throughout, but audit
 * events are missing, duplicated, out-of-order, or partially
 * unverifiable. The platform remains "up" while the evidence trail
 * itself is actively untrustworthy — this is the scenario's core decoy.
 * Six business invariants govern every decision: (1) audit evidence
 * must be complete enough to establish who did what and when; (2)
 * duplicate events must not silently count as multiple real actions;
 * (3) missing events must not be fabricated; (4) ordering may be
 * reconstructed only from trustworthy evidence; (5) immutable history
 * must not be rewritten to make reports look clean; (6) a bounded
 * reporting delay is acceptable if integrity is preserved. Decide
 * whether to withhold compliance reports until reconciliation finishes,
 * or publish a bounded, honestly-flagged "incomplete" status report
 * instead; whether to actively reconcile the backlog, dedupe by
 * fingerprint, and reconstruct order from trustworthy timestamps rather
 * than raw arrival order; whether a secondary, independently-verified
 * evidence source can legitimately close a real gap; and — critically —
 * whether publishing the next scheduled report "as-is" is the
 * operationally convenient choice it looks like, or a serious,
 * irreversible integrity violation.
 */
export const auditLogIntegrityFailure: ScenarioDefinition = {
  id: "audit-log-integrity-failure",
  slug: "audit-log-integrity-failure",
  version: 1,
  name: "Audit Log Integrity Failure",
  description:
    "Application traffic is fully healthy throughout — every uptime and latency dashboard reads green. But audit events are missing, duplicated, out of order, or partially unverifiable, following an upstream delivery degradation between the Event Stream and the Immutable Store. Six business invariants govern every decision: (1) audit evidence must be complete enough to establish who did what and when; (2) duplicate events must not silently count as multiple real actions; (3) missing events must not be fabricated; (4) ordering may be reconstructed only from trustworthy evidence; (5) immutable history must not be rewritten to make reports look clean; (6) a bounded reporting delay is acceptable if integrity is preserved. Decide whether to withhold the next scheduled compliance report until reconciliation finishes, or publish a bounded, honestly-flagged 'incomplete/unverified' status report instead; whether to actively reconcile the backlog, dedupe events by fingerprint, and reconstruct order from trustworthy source timestamps rather than raw arrival order; whether a secondary, independently-verified evidence source can legitimately close a real gap without fabricating anything; and — critically — whether publishing the next report 'as-is' is the operationally convenient choice it looks like, or a serious, permanent integrity violation.",
  difficulty: "principal",
  estimatedMinutes: 25,
  isFree: false,
  structure: "linear",
  simulation: auditLogIntegrityFailureSimulation,
  library: {
    category: "Security & Identity",
    tags: [
      "Compliance",
      "Audit Trail",
      "Evidence Integrity",
      "Data Governance",
      "Historical Damage",
      "Immutability",
    ],
    skills: [
      "Distinguishing application availability from evidence/audit-trail integrity",
      "Recognizing that publishing on schedule can certify a falsely-clean picture",
      "Treating completeness, duplication, ordering, and immutability as independent integrity axes",
      "Accepting a bounded reporting delay as the honest tradeoff for preserved evidence integrity",
    ],
    shortDescription:
      "Audit events are missing, duplicated, and out of order while every availability dashboard stays green — publishing the next compliance report on schedule looks routine but silently certifies a picture the evidence doesn't support.",
  },
};

export {
  auditLogIntegrityFailureSimulation,
  auditLogIntegrityFailureCandidateUI,
  AUDIT_LOG_INTEGRITY_FAILURE_SCORING,
  AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
  DUPLICATE_HANDLING_KEY,
  FALLBACK_EVIDENCE_SOURCE_KEY,
  IMMUTABLE_STORE_POLICY_KEY,
  INGESTION_PAUSE_KEY,
  ORDERING_RECONSTRUCTION_KEY,
  RECONCILIATION_MODE_KEY,
  REPORT_PUBLICATION_MODE_KEY,
};
