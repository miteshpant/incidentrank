import type { ActionClassificationRule } from "@incidentrank/simulator";
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

export const actionClassifications: ActionClassificationRule[] = [
  // ── reportPublicationMode ────────────────────────────────────────────
  {
    id: "acc_1",
    controlKey: REPORT_PUBLICATION_MODE_KEY,
    valueEquals: "publish-as-is",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Publishing the report as-is certified completeness the evidence did not support",
      explanation:
        "Shipping the next scheduled compliance report using whatever currently sits in the Immutable Store — without first reconciling or flagging the open gap — silently treats missing and unverifiable events as if they never happened. The report ships on time and looks tidy, but it is a genuine, serious integrity violation: it certifies a complete picture the evidence does not actually support. incorrectlyCertifiedReportCount records this permanently; the report, once sent, cannot be un-sent.",
    },
  },
  {
    id: "acc_2",
    controlKey: REPORT_PUBLICATION_MODE_KEY,
    valueEquals: "stage-until-reconciled",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Staging publication until reconciliation finishes never shipped a falsely-clean report",
      explanation:
        "Withholding every compliance report until reconciliation has genuinely repaired the backlog means nothing is ever published that overstates completeness. This accepts a real, bounded reporting delay — a tradeoff the business invariants explicitly permit — in exchange for never certifying a picture the evidence does not support. By itself this does not repair anything; reconciliationMode must also be engaged for the backlog to actually drain.",
    },
  },
  {
    id: "acc_3",
    controlKey: REPORT_PUBLICATION_MODE_KEY,
    valueEquals: "publish-with-unverified-flag",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Publishing with an unverified flag ships on schedule, but only stays honest if the flag is actually set",
      explanation:
        "Shipping a bounded 'incomplete/unverified' status report on schedule, instead of withholding publication entirely, is a legitimate alternate strategy — but it is only genuinely honest when auditGapAcknowledgement is also set to acknowledged-and-flagged. Left unflagged, this is just a differently-worded version of the publish-as-is trap: the report still implies more completeness than the evidence supports.",
    },
  },

  // ── reconciliationMode ───────────────────────────────────────────────
  {
    id: "acc_4",
    controlKey: RECONCILIATION_MODE_KEY,
    valueEquals: "active",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Engaging reconciliation is what actually repairs the backlog over time",
      explanation:
        "Replaying and cross-checking queued audit events against trustworthy upstream sources is the only lever that drains reconciliationBacklogCount and genuinely restores eventCompletenessPercent/orderingConfidencePercent to their healthy bound. Required by BOTH alternate strong paths — neither a safe publication mode alone, nor leaving this off, repairs anything on its own.",
    },
  },
  {
    id: "acc_5",
    controlKey: RECONCILIATION_MODE_KEY,
    valueEquals: "off",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Leaving reconciliation off means the backlog never improves on its own",
      explanation:
        "The reconciliation backlog does not drain by itself — it needs the Reconciliation Worker actively engaged. Leaving this off while choosing an otherwise-safe publication mode still leaves event completeness and ordering confidence degraded indefinitely; no amount of waiting fixes this without reconciliationMode engaged.",
    },
  },

  // ── duplicateHandling ────────────────────────────────────────────────
  {
    id: "acc_6",
    controlKey: DUPLICATE_HANDLING_KEY,
    valueEquals: "dedupe-by-fingerprint",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Deduping by fingerprint stopped duplicates from counting as separate real actions",
      explanation:
        "Collapsing duplicate audit events back to one real event before they reach a report or an ordering decision is what directly satisfies the invariant that duplicate events must not silently count as multiple real actions. Required by both alternate strong paths, independent of which publication mode is chosen — a safe publication mode alone does not fix inflated underlying counts.",
    },
  },
  {
    id: "acc_7",
    controlKey: DUPLICATE_HANDLING_KEY,
    valueEquals: "count-as-is",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Counting duplicates as-is let the same action be recorded as multiple real events",
      explanation:
        "Leaving duplicate audit events exactly as received means each duplicate is silently counted as if it were a second, separate real action — a direct breach of the 'duplicate events must not silently count as multiple real actions' invariant, regardless of how carefully publication or reconciliation is otherwise handled.",
    },
  },

  // ── orderingReconstructionMode ───────────────────────────────────────
  {
    id: "acc_8",
    controlKey: ORDERING_RECONSTRUCTION_KEY,
    valueEquals: "timestamp-verified-reconstruction",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reconstructing order from signed source timestamps used genuinely trustworthy evidence",
      explanation:
        "Reconstructing event order from the Audit Logger's signed source timestamps — rather than raw arrival order — satisfies the invariant that ordering may be reconstructed only from trustworthy evidence. Signed source timestamps remain trustworthy even while delivery itself is degraded; raw arrival order under that same degradation is not.",
    },
  },
  {
    id: "acc_9",
    controlKey: ORDERING_RECONSTRUCTION_KEY,
    valueEquals: "trust-arrival-order",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Trusting raw arrival order treated untrustworthy evidence as if it proved true sequence",
      explanation:
        "Accepting whatever order events happened to arrive at the Immutable Store is not the same as the order the underlying actions actually occurred in once delivery is degraded — this is a direct, independent breach of 'ordering may be reconstructed only from trustworthy evidence,' reachable even when publication and reconciliation are otherwise handled safely.",
    },
  },

  // ── fallbackEvidenceSource ───────────────────────────────────────────
  {
    id: "acc_10",
    controlKey: FALLBACK_EVIDENCE_SOURCE_KEY,
    valueEquals: "enabled",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Consulting the fallback evidence source recovered real gaps instead of leaving them missing",
      explanation:
        "Consulting the Audit Logger's own signed local buffer — a source never touched by the Event Stream degradation — lets a genuine gap be closed with real, verifiable evidence rather than left permanently missing. This is not fabrication: recovering a real missing event from a trustworthy source is explicitly different from inventing a plausible-looking one. Materially lowers the final unverifiableEventCount peak.",
    },
  },
  {
    id: "acc_11",
    controlKey: FALLBACK_EVIDENCE_SOURCE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the fallback evidence source disabled left recoverable gaps as missing",
      explanation:
        "Not consulting the Audit Logger's independently-trustworthy local buffer means a genuinely recoverable gap stays missing rather than being closed with real evidence. This is honest (it never fabricates anything) but leaves more of the attempt's unverifiable-event exposure unrecovered than it needed to be — a real, if optional, completeness opportunity left on the table.",
    },
  },

  // ── ingestionPause ───────────────────────────────────────────────────
  {
    id: "acc_12",
    controlKey: INGESTION_PAUSE_KEY,
    valueEquals: "paused",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Pausing ingestion let reconciliation work against a fixed, non-growing backlog",
      explanation:
        "Stopping new audit-event ingestion while reconciliation works through the existing backlog means the backlog cannot keep growing while being repaired, reaching a fully reconciled state measurably faster. A real, if minor, extra infrastructure cost and an accepted bounded delay before new events are ingested again — a tradeoff the business invariants explicitly permit.",
    },
  },
  {
    id: "acc_13",
    controlKey: INGESTION_PAUSE_KEY,
    valueEquals: "off",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving ingestion running kept new events flowing while reconciliation worked concurrently",
      explanation:
        "Not pausing ingestion means new audit events keep arriving (and potentially keep needing reconciliation) while the Reconciliation Worker runs concurrently against a backlog that keeps growing a little longer before it starts shrinking. Not unsafe by itself — reconciliation still eventually catches up — just a slower route to a fully reconciled state than pausing ingestion first.",
    },
  },

  // ── immutableStorePolicy ─────────────────────────────────────────────
  {
    id: "acc_14",
    controlKey: IMMUTABLE_STORE_POLICY_KEY,
    valueEquals: "rewrite-allowed",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Allowing rewrites to the immutable store tampered with history to make reports look clean",
      explanation:
        "Disabling append-only enforcement lets a previously-appended audit record be edited or removed outright — a direct breach of 'immutable history must not be rewritten to make reports look clean,' and the single most severe action available in this scenario. tamperEvidenceStatus becomes permanently 'compromised' for the rest of this attempt the instant this happens, independent of every other control — even an otherwise fully correct remediation afterward cannot undo it.",
    },
  },
  {
    id: "acc_15",
    controlKey: IMMUTABLE_STORE_POLICY_KEY,
    valueEquals: "append-only",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Keeping append-only enforcement intact meant history was never rewritten",
      explanation:
        "Leaving the Immutable Store's append-only enforcement in place means no previously-appended audit record can be edited or removed, however convenient doing so might look while cleaning up duplicates or gaps. This is the scenario's required baseline integrity guarantee, not an optional nicety.",
    },
  },

  // ── auditGapAcknowledgement ──────────────────────────────────────────
  {
    id: "acc_16",
    controlKey: AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
    valueEquals: "acknowledged-and-flagged",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Flagging the open gap made a published bounded report genuinely honest",
      explanation:
        "Explicitly acknowledging and flagging a currently-open audit gap on anything published is what makes publishing a bounded 'incomplete/unverified' status report genuinely different from the publish-as-is trap — the report carries its own incompleteness rather than implying completeness it doesn't have. Only meaningful when reportPublicationMode is publish-with-unverified-flag; has no effect under stage-until-reconciled, since nothing is published at all until reconciliation finishes.",
    },
  },
  {
    id: "acc_17",
    controlKey: AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
    valueEquals: "unacknowledged",
    whenTriggerEquals: { evidenceDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Leaving the gap unacknowledged is only safe when nothing is currently being published",
      explanation:
        "Not flagging the open audit gap is harmless on its own under stage-until-reconciled (nothing is published until reconciliation finishes, so there is nothing to mislead). Combined with publish-with-unverified-flag, however, it turns that publication into an unflagged, falsely-reassuring report — the same violation as publishing as-is, just under a different control.",
    },
  },
];
