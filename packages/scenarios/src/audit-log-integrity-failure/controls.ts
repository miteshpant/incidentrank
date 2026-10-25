import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * How Compliance Reports are published while the audit trail is
 * degraded. "publish-as-is" (default) is the scenario's REQUIRED
 * tempting-but-unsafe trap: it ships the next scheduled compliance
 * report on time, using whatever events currently sit in the Immutable
 * Store — silently treating unverifiable/missing events as if they
 * simply never happened. The report LOOKS clean (on time, no visible
 * caveats) but is a genuine, serious integrity violation: it certifies
 * a complete picture the evidence does not actually support, directly
 * breaching "missing events must not be fabricated" and "immutable
 * history must not be rewritten to make reports look clean." Both safe
 * values are real alternate strong paths (see rules.ts): "stage-until-
 * reconciled" withholds publication entirely until reconciliation
 * finishes (Path A); "publish-with-unverified-flag" ships a bounded,
 * honestly-labeled "incomplete/unverified" status report on schedule
 * while repair continues in the background (Path B) — both genuinely
 * preserve integrity, neither ever certifies a falsely-clean report.
 */
export const REPORT_PUBLICATION_MODE_KEY = "reportPublicationMode";

/**
 * Whether the Reconciliation Worker (modeled as a mode on the Event
 * Stream / Immutable Store, not a separate node) is actively replaying
 * and cross-checking audit events against trustworthy upstream sources
 * to repair completeness/duplication/ordering. "off" (default) leaves
 * the reconciliation backlog exactly where the degradation left it —
 * it does not get worse on its own, but it also never improves without
 * this engaged. "active" is what actually drains the backlog over real
 * elapsed time (see timed-events.ts's drain windows) and is required by
 * BOTH alternate strong paths; neither reportPublicationMode value alone
 * repairs anything without this also being engaged.
 */
export const RECONCILIATION_MODE_KEY = "reconciliationMode";

/**
 * How duplicate audit events (the same action logged more than once,
 * e.g. from a retried delivery) are treated. "count-as-is" (default)
 * leaves duplicates exactly as received — each duplicate silently counts
 * as if it were a second, separate real action, directly breaching
 * "duplicate events must not silently count as multiple real actions."
 * "dedupe-by-fingerprint" collapses duplicates back to one real event
 * before they ever reach a report or an ordering decision. Independent
 * of reportPublicationMode and reconciliationMode — a candidate who
 * engages a safe publication mode but never dedupes still ships a report
 * whose underlying counts are inflated.
 */
export const DUPLICATE_HANDLING_KEY = "duplicateHandling";

/**
 * How event ORDER is established when reconstructing the audit trail.
 * "trust-arrival-order" (default) accepts whatever order events happened
 * to arrive at the Immutable Store — which, under a delivery
 * degradation, is not the same as the order the underlying actions
 * actually occurred in. This directly breaches "ordering may be
 * reconstructed only from trustworthy evidence": arrival order under
 * degraded delivery is not trustworthy evidence of true sequence.
 * "timestamp-verified-reconstruction" instead reconstructs order from
 * the Audit Logger's signed source timestamps, which remain trustworthy
 * even when delivery itself is degraded.
 */
export const ORDERING_RECONSTRUCTION_KEY = "orderingReconstructionMode";

/**
 * Whether a secondary, independently-trustworthy evidence source (the
 * Audit Logger's own signed local buffer, never touched by the Event
 * Stream degradation) is consulted to fill genuine gaps. "disabled"
 * (default) leaves gaps exactly as missing — honest, but incomplete.
 * "enabled" lets a real, verifiable gap be closed with real evidence
 * from a source that was never compromised, which is different from
 * both "leave it missing" and "fabricate it" — this is what the
 * business invariant "missing events must not be fabricated" permits:
 * recovering a real missing event from a trustworthy source is not
 * fabrication, inventing a plausible-looking one is.
 */
export const FALLBACK_EVIDENCE_SOURCE_KEY = "fallbackEvidenceSource";

/**
 * Whether new audit event ingestion is paused while reconciliation
 * works through the existing backlog. "off" (default) lets new events
 * keep arriving (and potentially keep degrading) while reconciliation
 * runs concurrently. "paused" stops new ingestion so reconciliation
 * works against a fixed, non-growing backlog — genuinely faster to
 * reach a fully reconciled state (required by Path A, stage-until-
 * reconciled), at the real cost of a bounded reporting delay the
 * business invariants explicitly permit ("a bounded reporting delay is
 * acceptable if integrity is preserved").
 */
export const INGESTION_PAUSE_KEY = "ingestionPause";

/**
 * Whether the Immutable Store actually enforces append-only semantics.
 * "append-only" (default — this is NOT part of the misconfiguration;
 * the store's enforcement itself is intact from the start) rejects any
 * attempt to rewrite or retroactively edit a previously appended record.
 * "rewrite-allowed" is the scenario's second, independent unsafe lever:
 * disabling append-only enforcement so an existing, previously-appended
 * record can be edited or removed outright — directly breaching
 * "immutable history must not be rewritten to make reports look clean,"
 * the most severe single action in this scenario regardless of why it
 * was done (even "cleaning up a duplicate" by rewriting history, rather
 * than deduping forward, is never acceptable).
 */
export const IMMUTABLE_STORE_POLICY_KEY = "immutableStorePolicy";

/**
 * Whether a currently-open audit gap (events still missing, duplicated,
 * out of order, or unverifiable) is explicitly acknowledged and flagged
 * on anything published, versus left silently unacknowledged.
 * "unacknowledged" (default) is part of what makes "publish-as-is"
 * dishonest: nothing published says the underlying evidence is
 * incomplete. "acknowledged-and-flagged" is what makes
 * "publish-with-unverified-flag" (Path B) genuinely honest rather than
 * merely differently-worded — the published report explicitly carries
 * its own incompleteness rather than implying completeness it doesn't
 * have. Meaningless (and left at its default) when
 * reportPublicationMode is "stage-until-reconciled," since nothing is
 * published at all until reconciliation is done — see rules.ts.
 */
export const AUDIT_GAP_ACKNOWLEDGEMENT_KEY = "auditGapAcknowledgement";

export const controls: ControlDefinition[] = [
  {
    key: REPORT_PUBLICATION_MODE_KEY,
    allowedValues: ["publish-as-is", "stage-until-reconciled", "publish-with-unverified-flag"],
    initialValue: "publish-as-is",
  },
  {
    key: RECONCILIATION_MODE_KEY,
    allowedValues: ["off", "active"],
    initialValue: "off",
  },
  {
    key: DUPLICATE_HANDLING_KEY,
    allowedValues: ["count-as-is", "dedupe-by-fingerprint"],
    initialValue: "count-as-is",
  },
  {
    key: ORDERING_RECONSTRUCTION_KEY,
    allowedValues: ["trust-arrival-order", "timestamp-verified-reconstruction"],
    initialValue: "trust-arrival-order",
  },
  {
    key: FALLBACK_EVIDENCE_SOURCE_KEY,
    allowedValues: ["disabled", "enabled"],
    initialValue: "disabled",
  },
  {
    key: INGESTION_PAUSE_KEY,
    allowedValues: ["off", "paused"],
    initialValue: "off",
  },
  {
    key: IMMUTABLE_STORE_POLICY_KEY,
    allowedValues: ["append-only", "rewrite-allowed"],
    initialValue: "append-only",
  },
  {
    key: AUDIT_GAP_ACKNOWLEDGEMENT_KEY,
    allowedValues: ["unacknowledged", "acknowledged-and-flagged"],
    initialValue: "unacknowledged",
  },
];
