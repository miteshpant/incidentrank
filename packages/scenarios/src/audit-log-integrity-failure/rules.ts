import type { ComponentHealth, Rule } from "@incidentrank/simulator";
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

const healthyHealth: Record<string, ComponentHealth> = {
  services: "healthy",
  "audit-logger": "healthy",
  "event-stream": "healthy",
  "immutable-store": "healthy",
  "compliance-reports": "healthy",
};

// Services and Audit Logger NEVER leave "healthy" in this scenario, in
// any rule, including every unsafe one — the entire Principal-level
// point is that uptime/write-success never signal the problem. Only
// Event Stream / Immutable Store / Compliance Reports health
// communicates severity, and only for the evidence-integrity axis.
const streamDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "critical",
  "compliance-reports": "critical",
};

const tamperedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "immutable-store": "critical",
  "compliance-reports": "critical",
};

const draininHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "event-stream": "degraded",
  "compliance-reports": "degraded",
};

/**
 * Authored rule table for Audit Log Integrity Failure, ordered
 * most-specific-first (first-match-wins, top-to-bottom). Every
 * correctness-violation trap is checked before the generic safe/
 * baseline families below it, because a currently-live integrity
 * violation — a falsely-clean report in circulation, or tampered
 * immutable history — is never acceptable however healthy Services/
 * Audit Logger look.
 *
 * ROOT CAUSE: an upstream delivery degradation (evidenceDegraded)
 * between the Event Stream and the Immutable Store causes audit events
 * to arrive missing, duplicated, or out of order, and some events lose
 * verifiable evidence entirely. servicesUptimePercent and
 * auditLoggerWriteSuccessRate never move in ANY rule below — this must
 * never look like a generic availability incident.
 *
 * CENTRAL JUDGMENT (business invariants, see definition.ts): audit
 * evidence must be complete enough to establish who did what and when;
 * duplicate events must not silently count as multiple real actions;
 * missing events must not be fabricated; ordering may be reconstructed
 * only from trustworthy evidence; immutable history must not be
 * rewritten to make reports look clean; a bounded reporting delay is
 * acceptable if integrity is preserved.
 *
 * THE CORRECTLY-SCOPED REMEDIATION GATE (shared by both alternate
 * strong paths): reconciliationMode="active" (actually repairs the
 * backlog) AND duplicateHandling="dedupe-by-fingerprint" (counts stop
 * being inflated) AND orderingReconstructionMode=
 * "timestamp-verified-reconstruction" (order is reconstructed from
 * trustworthy evidence, not raw arrival order) AND
 * immutableStorePolicy="append-only" (never compromised — checked
 * independently below, wins over every other control). Neither
 * alternate path below is safe without ALL FOUR of these engaged; this
 * is exactly why rules below enumerate this four-control gate
 * explicitly rather than inferring it from reportPublicationMode alone.
 *
 * REQUIRED TEMPTING-BUT-UNSAFE TRAP #1: reportPublicationMode=
 * "publish-as-is" ships the next scheduled compliance report on
 * schedule, using whatever is currently in the Immutable Store —
 * looking maximally convenient (on time, no visible caveats) while
 * silently treating missing/unverifiable events as if they never
 * happened. Never acceptable, checked ahead of the generic baseline.
 *
 * REQUIRED TEMPTING-BUT-UNSAFE TRAP #2 (independent): immutableStorePolicy
 * = "rewrite-allowed" disables append-only enforcement, letting a
 * previously-appended record be edited or removed outright — the single
 * most severe action in this scenario. tamperEvidenceStatus becomes
 * "compromised" PERMANENTLY once this happens (see definition.ts's
 * numericWatchFields trackPeak-style permanence modeling via the string
 * field itself never reverting in any rule below), independent of every
 * other control — even an otherwise fully correct remediation cannot
 * undo a tampering event that already happened.
 *
 * ALTERNATE STRONG PATHS (both reach OPTIMAL once genuinely engaged and
 * drained; see the alternate-strong-path audit in the completion
 * report):
 *   A. Stage-until-reconciled: reportPublicationMode=
 *      "stage-until-reconciled" — withholds publication entirely until
 *      reconciliation finishes. Never ships a single report while the
 *      gap is open. Can be accelerated with ingestionPause="paused"
 *      (reconciliation works against a fixed, non-growing backlog) but
 *      this is NOT required — leaving ingestionPause at its untouched
 *      default "off" still reaches the same safe terminal state, just
 *      slower (see the default-value completeness audit below).
 *   B. Publish-with-unverified-flag: reportPublicationMode=
 *      "publish-with-unverified-flag" + auditGapAcknowledgement=
 *      "acknowledged-and-flagged" (REQUIRED — publishing on schedule
 *      without flagging the open gap would just be a differently-worded
 *      version of the publish-as-is trap) — ships a bounded, honestly-
 *      labeled "incomplete/unverified" status report on schedule while
 *      repair continues in the background. Both reach the same
 *      terminal compliance state once drained; A is the more
 *      conservative "say nothing until it's true" route, B is the
 *      "say something true now" route — recovery/customerImpact
 *      dimensions honestly reflect A's bounded reporting delay against
 *      B's on-time-but-labeled-incomplete publication.
 *
 * NO SCALE-X-OVERLOAD-Y MECHANIC: nothing in this scenario scales a
 * service and then overloads a downstream dependency — every lever here
 * either corrects how evidence is reconciled/counted/ordered, decides
 * whether/how to publish while a gap is open, or governs whether
 * immutable history itself can be rewritten. No new bottleneck is ever
 * created anywhere.
 */
export const auditLogIntegrityFailureRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAPS — checked first: win regardless of every
  // other control, because a currently-live integrity violation is
  // never acceptable however healthy Services/Audit Logger look.
  // ══════════════════════════════════════════════════════════════════

  // Tamper trap: the single most severe, independent unsafe lever.
  // Checked AHEAD of every other rule (including publish-as-is) because
  // a tampered immutable store is never acceptable regardless of what
  // publication mode is chosen, and because the tamper event itself —
  // not merely its interaction with publishing — is the violation.
  {
    id: "immutable-store-tampered",
    when: {
      triggerEquals: { evidenceDegraded: true },
      controlEquals: { [IMMUTABLE_STORE_POLICY_KEY]: "rewrite-allowed" },
    },
    incidentState: "immutable-store-tampered",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 70,
      duplicateEventRate: 8,
      orderingConfidencePercent: 60,
      immutableStoreAppendSuccessRate: 40,
      reconciliationBacklogCount: 220,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "compromised",
      unverifiableEventCount: 60,
      incorrectlyCertifiedReportCount: 1,
      reportCertificationStatus: "falsely-certified",
      auditGapDisclosureStatus: "unacknowledged",
      evidenceIntegritySeverity: "critical",
    },
    componentHealth: tamperedHealth,
  },

  // Publish-as-is trap, sustained: the scenario's primary required
  // trap. Ships a falsely-clean report while the gap is wide open and
  // compounding.
  {
    id: "publish-as-is-sustained",
    when: {
      triggerEquals: { evidenceDegraded: true, sustainedDegradation: true },
      controlEquals: { [REPORT_PUBLICATION_MODE_KEY]: "publish-as-is" },
    },
    incidentState: "publish-as-is-sustained",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 58,
      duplicateEventRate: 14,
      orderingConfidencePercent: 55,
      immutableStoreAppendSuccessRate: 96,
      reconciliationBacklogCount: 260,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 420,
      incorrectlyCertifiedReportCount: 3,
      reportCertificationStatus: "falsely-certified",
      auditGapDisclosureStatus: "unacknowledged",
      evidenceIntegritySeverity: "critical",
    },
    componentHealth: streamDegradedHealth,
  },
  {
    id: "publish-as-is-active",
    when: {
      triggerEquals: { evidenceDegraded: true },
      controlEquals: { [REPORT_PUBLICATION_MODE_KEY]: "publish-as-is" },
    },
    incidentState: "publish-as-is-active",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 75,
      duplicateEventRate: 9,
      orderingConfidencePercent: 68,
      immutableStoreAppendSuccessRate: 97,
      reconciliationBacklogCount: 95,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 55,
      incorrectlyCertifiedReportCount: 1,
      reportCertificationStatus: "falsely-certified",
      auditGapDisclosureStatus: "unacknowledged",
      evidenceIntegritySeverity: "critical",
    },
    componentHealth: streamDegradedHealth,
  },

  // Unflagged-publication trap: publishing the bounded status report
  // WITHOUT flagging the open gap is just a differently-worded version
  // of publish-as-is — it still implies more completeness than the
  // evidence supports. Proves auditGapAcknowledgement is a real,
  // required lever for Path B, not decorative.
  {
    id: "unverified-report-unflagged-sustained",
    when: {
      triggerEquals: { evidenceDegraded: true, sustainedDegradation: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "publish-with-unverified-flag",
        [AUDIT_GAP_ACKNOWLEDGEMENT_KEY]: "unacknowledged",
      },
    },
    incidentState: "unverified-report-unflagged-sustained",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 60,
      duplicateEventRate: 12,
      orderingConfidencePercent: 58,
      immutableStoreAppendSuccessRate: 97,
      reconciliationBacklogCount: 240,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 180,
      incorrectlyCertifiedReportCount: 2,
      reportCertificationStatus: "falsely-certified",
      auditGapDisclosureStatus: "unacknowledged",
      evidenceIntegritySeverity: "critical",
    },
    componentHealth: streamDegradedHealth,
  },

  // Ordering-trust trap: trusting raw arrival order as if it were
  // trustworthy evidence of true sequence, sustained — an independent
  // violation of "ordering may be reconstructed only from trustworthy
  // evidence," reachable even when publication/reconciliation are
  // otherwise engaged safely (reportPublicationMode staged,
  // reconciliationMode active, duplicates deduped) — proving ordering
  // is checked on its own, not merely folded into the completeness
  // number.
  {
    id: "ordering-untrustworthy-sustained",
    when: {
      triggerEquals: { evidenceDegraded: true, sustainedDegradation: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "stage-until-reconciled",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "trust-arrival-order",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
      },
    },
    incidentState: "ordering-untrustworthy-sustained",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 94,
      duplicateEventRate: 0,
      orderingConfidencePercent: 45,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 70,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 40,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "acknowledged-and-flagged",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE FAMILY — the four-control remediation gate
  // (reconciliationMode=active + duplicateHandling=dedupe-by-fingerprint
  // + orderingReconstructionMode=timestamp-verified-reconstruction +
  // immutableStorePolicy=append-only) engaged, branching into Path A
  // (stage-until-reconciled) and Path B (publish-with-unverified-flag +
  // acknowledged-and-flagged). ingestionPause and fallbackEvidenceSource
  // are independent, OPTIONAL accelerants left at their untouched
  // defaults ("off"/"disabled") in the base variants below — every
  // combination is enumerated explicitly at each drain stage so that
  // leaving either at its default never falls through to an unrelated
  // baseline/unsafe rule purely from elapsed time. This is the batch's
  // binding default-value path completeness requirement.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: Path A, fully reconciled, ingestion left running
  // (default) — proving ingestionPause is a real optional accelerant,
  // not a hidden requirement for safety.
  {
    id: "path-a-fully-reconciled-ingestion-default",
    when: {
      triggerEquals: { evidenceDegraded: true, drainWindowFullyReconciledElapsed: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "stage-until-reconciled",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [INGESTION_PAUSE_KEY]: "off",
      },
    },
    incidentState: "path-a-fully-reconciled-ingestion-default",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 100,
      duplicateEventRate: 0,
      orderingConfidencePercent: 100,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 0,
      evidenceReconciliationTier: "full",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 35,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path A, fully reconciled, ingestion paused (faster drain
  // — reconciliation worked against a fixed, non-growing backlog).
  {
    id: "path-a-fully-reconciled-ingestion-paused",
    when: {
      triggerEquals: { evidenceDegraded: true, drainWindowFullyReconciledElapsed: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "stage-until-reconciled",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [INGESTION_PAUSE_KEY]: "paused",
      },
    },
    incidentState: "path-a-fully-reconciled-ingestion-paused",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 100,
      duplicateEventRate: 0,
      orderingConfidencePercent: 100,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 0,
      evidenceReconciliationTier: "full",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 20,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path B, fully reconciled, with the fallback evidence
  // source engaged — recovers genuinely-verifiable gaps from the Audit
  // Logger's own trustworthy local buffer rather than leaving them
  // permanently unverifiable, so unverifiableEventCount's final peak is
  // materially lower. MUST be listed BEFORE path-b-fully-reconciled-
  // flagged below (more specific — that rule does not constrain
  // fallbackEvidenceSource, so without this ordering a candidate who
  // additionally enabled the fallback source on top of base Path B
  // would still match the less-specific rule first and the real,
  // distinct completeness benefit of that extra choice would be
  // silently absorbed rather than made visible). A real, distinct
  // combination from the base Path B variant below (fallbackEvidence
  // Source left at its untouched default "disabled" there) —
  // enumerated explicitly for the same default-value completeness
  // reason as every other optional lever in this table.
  {
    id: "path-b-fully-reconciled-flagged-fallback-enabled",
    when: {
      triggerEquals: { evidenceDegraded: true, drainWindowFullyReconciledElapsed: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "publish-with-unverified-flag",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [AUDIT_GAP_ACKNOWLEDGEMENT_KEY]: "acknowledged-and-flagged",
        [FALLBACK_EVIDENCE_SOURCE_KEY]: "enabled",
      },
    },
    incidentState: "path-b-fully-reconciled-flagged-fallback-enabled",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 100,
      duplicateEventRate: 0,
      orderingConfidencePercent: 100,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 0,
      evidenceReconciliationTier: "full",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 8,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL: Path B, fully reconciled, flagged throughout. Without
  // this rule, a candidate who used Path B (leaving ingestionPause and
  // fallbackEvidenceSource at their untouched defaults) would fall
  // through to the unmitigated baseline once drainWindowFullyReconciled
  // fires — exactly the default-value completeness bug this batch must
  // avoid.
  {
    id: "path-b-fully-reconciled-flagged",
    when: {
      triggerEquals: { evidenceDegraded: true, drainWindowFullyReconciledElapsed: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "publish-with-unverified-flag",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [AUDIT_GAP_ACKNOWLEDGEMENT_KEY]: "acknowledged-and-flagged",
      },
    },
    incidentState: "path-b-fully-reconciled-flagged",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 100,
      duplicateEventRate: 0,
      orderingConfidencePercent: 100,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 0,
      evidenceReconciliationTier: "full",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 35,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: remediation gate engaged, draining but not yet
  // fully reconciled — reportTrustStatus is already "trustworthy" (no
  // falsely-clean report currently stands) and tamperEvidenceStatus is
  // "intact," but the backlog has not fully drained, so completeness/
  // ordering confidence have not yet reached their fully healthy bound.
  // Each path's base and ingestion/fallback variants are enumerated at
  // this drain stage too, for the identical default-value completeness
  // reason as the OPTIMAL tier above.
  {
    id: "path-a-draining-window1",
    when: {
      triggerEquals: {
        evidenceDegraded: true,
        sustainedDegradation: true,
        drainWindow1Elapsed: true,
        drainWindowFullyReconciledElapsed: false,
      },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "stage-until-reconciled",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
      },
    },
    incidentState: "path-a-draining-window1",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 90,
      duplicateEventRate: 0,
      orderingConfidencePercent: 92,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 60,
      evidenceReconciliationTier: "partial",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 35,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "path-b-draining-window1",
    when: {
      triggerEquals: {
        evidenceDegraded: true,
        sustainedDegradation: true,
        drainWindow1Elapsed: true,
        drainWindowFullyReconciledElapsed: false,
      },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "publish-with-unverified-flag",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [AUDIT_GAP_ACKNOWLEDGEMENT_KEY]: "acknowledged-and-flagged",
      },
    },
    incidentState: "path-b-draining-window1",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 88,
      duplicateEventRate: 0,
      orderingConfidencePercent: 90,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 65,
      evidenceReconciliationTier: "partial",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 35,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "acknowledged-and-flagged",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Just-engaged tick-zero proof: the remediation gate flipped this
  // instant (no elapsed drain window yet, not even drainWindow1) for
  // EITHER path — proving the drain is not instant. Deliberately
  // matches on just the four-control gate plus either publication mode
  // (via two separate rules, since reportPublicationMode's value
  // differs) rather than requiring a specific ingestionPause/
  // fallbackEvidenceSource/auditGapAcknowledgement combination at this
  // instant, since none of those change the RATE numbers the instant
  // the gate is flipped — only how fast later rules' numbers differ.
  {
    id: "path-a-just-engaged-no-drain-yet",
    when: {
      triggerEquals: {
        evidenceDegraded: true,
        sustainedDegradation: true,
        drainWindow1Elapsed: false,
      },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "stage-until-reconciled",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
      },
    },
    incidentState: "path-a-just-engaged-no-drain-yet",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 75,
      duplicateEventRate: 0,
      orderingConfidencePercent: 70,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 180,
      evidenceReconciliationTier: "partial",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 35,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "path-b-just-engaged-no-drain-yet",
    when: {
      triggerEquals: {
        evidenceDegraded: true,
        sustainedDegradation: true,
        drainWindow1Elapsed: false,
      },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "publish-with-unverified-flag",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [AUDIT_GAP_ACKNOWLEDGEMENT_KEY]: "acknowledged-and-flagged",
      },
    },
    incidentState: "path-b-just-engaged-no-drain-yet",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 72,
      duplicateEventRate: 0,
      orderingConfidencePercent: 68,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 190,
      evidenceReconciliationTier: "partial",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 35,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "acknowledged-and-flagged",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ── Corrected before sustained-degradation even fires (fast candidate
  // reaction) — same four-control gate, either publication mode, but
  // matched before the sustained-exposure window, so the unverifiable
  // count is much smaller. Deliberately placed after every
  // sustained-gated safe rule above (more specific trigger set wins)
  // but before the generic unmitigated baseline below.
  {
    id: "path-a-corrected-before-sustained",
    when: {
      triggerEquals: { evidenceDegraded: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "stage-until-reconciled",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
      },
    },
    incidentState: "path-a-corrected-before-sustained",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 85,
      duplicateEventRate: 0,
      orderingConfidencePercent: 82,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 30,
      evidenceReconciliationTier: "partial",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 10,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },
  {
    id: "path-b-corrected-before-sustained",
    when: {
      triggerEquals: { evidenceDegraded: true },
      controlEquals: {
        [REPORT_PUBLICATION_MODE_KEY]: "publish-with-unverified-flag",
        [RECONCILIATION_MODE_KEY]: "active",
        [DUPLICATE_HANDLING_KEY]: "dedupe-by-fingerprint",
        [ORDERING_RECONSTRUCTION_KEY]: "timestamp-verified-reconstruction",
        [IMMUTABLE_STORE_POLICY_KEY]: "append-only",
        [AUDIT_GAP_ACKNOWLEDGEMENT_KEY]: "acknowledged-and-flagged",
      },
    },
    incidentState: "path-b-corrected-before-sustained",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 83,
      duplicateEventRate: 0,
      orderingConfidencePercent: 80,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 32,
      evidenceReconciliationTier: "partial",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 10,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "acknowledged-and-flagged",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: draininHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO MITIGATION — reportPublicationMode left "publish-as-is" is
  // already covered above as the primary trap; this baseline covers
  // every OTHER combination that never engages the full four-control
  // remediation gate (e.g. reconciliationMode left "off", or
  // duplicateHandling/orderingReconstructionMode left at their
  // untouched defaults, with reportPublicationMode set to either safe
  // value) — a real, unaddressed, live evidence-integrity degradation.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-degraded",
    when: { triggerEquals: { evidenceDegraded: true, sustainedDegradation: true } },
    incidentState: "baseline-sustained-degraded",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 62,
      duplicateEventRate: 11,
      orderingConfidencePercent: 58,
      immutableStoreAppendSuccessRate: 97,
      reconciliationBacklogCount: 300,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 150,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "critical",
    },
    componentHealth: streamDegradedHealth,
  },
  {
    id: "baseline-degraded",
    when: { triggerEquals: { evidenceDegraded: true } },
    incidentState: "baseline-degraded",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 80,
      duplicateEventRate: 6,
      orderingConfidencePercent: 72,
      immutableStoreAppendSuccessRate: 98,
      reconciliationBacklogCount: 85,
      evidenceReconciliationTier: "violated",
      reportTrustStatus: "untrustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 30,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "warning",
    },
    componentHealth: streamDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      servicesUptimePercent: 99.97,
      auditLoggerWriteSuccessRate: 100,
      eventCompletenessPercent: 100,
      duplicateEventRate: 0,
      orderingConfidencePercent: 100,
      immutableStoreAppendSuccessRate: 100,
      reconciliationBacklogCount: 0,
      evidenceReconciliationTier: "full",
      reportTrustStatus: "trustworthy",
      tamperEvidenceStatus: "intact",
      unverifiableEventCount: 0,
      incorrectlyCertifiedReportCount: 0,
      reportCertificationStatus: "never-falsely-certified",
      auditGapDisclosureStatus: "not-applicable",
      evidenceIntegritySeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
