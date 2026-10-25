import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (the DECOY signal) ──────────────────────────
  // Services and the Audit Logger stay fully healthy the ENTIRE
  // incident, by design — the root cause is an evidence-integrity
  // degradation between the Event Stream and the Immutable Store, never
  // an availability failure. A candidate who only watches these two
  // numbers never discovers anything is wrong.
  servicesUptimePercent: 99.97,
  auditLoggerWriteSuccessRate: 100,

  // ── The REAL problem: evidence integrity ────────────────────────────
  // Percent of audit events for the current reporting window that are
  // present, non-duplicated, and verifiable. 100 is healthy. Drops while
  // the delivery degradation is active and reconciliation has not yet
  // repaired it.
  eventCompletenessPercent: 100,
  // Percent of currently-ingested events that are duplicates of an
  // already-recorded event. 0 is healthy.
  duplicateEventRate: 0,
  // Confidence (percent) that the currently-reconstructed event order
  // matches the true order the underlying actions occurred in. 100 is
  // healthy. Drops when ordering is reconstructed from untrustworthy
  // evidence (raw arrival order) during a delivery degradation.
  orderingConfidencePercent: 100,
  // Percent of append attempts to the Immutable Store that succeed
  // without needing a retroactive rewrite. 100 is healthy.
  immutableStoreAppendSuccessRate: 100,
  // Number of audit events currently queued for reconciliation
  // (missing/duplicate/out-of-order/unverifiable events not yet
  // resolved against trustworthy evidence). 0 is healthy. UNLIKE the
  // two cumulative counters below, this is a live, DRAINABLE backlog —
  // it genuinely falls once reconciliationMode is engaged and enough
  // time elapses (see timed-events.ts), not a permanent record.
  reconciliationBacklogCount: 0,

  // ── Summary string-state fields (authoritative for scoring +
  // success/acceptable conditions) ─────────────────────────────────────
  //   "trustworthy"   — no compliance report currently in circulation
  //                      overstates completeness, AND no open gap
  //                      currently exists that an unaddressed delivery
  //                      degradation would otherwise be silently
  //                      certifying over. This is a LIVE status: it
  //                      reads "untrustworthy" the instant a
  //                      degradation is active and NO safe remediation
  //                      lever (reportPublicationMode=stage-until-
  //                      reconciled, or publish-with-unverified-flag +
  //                      auditGapAcknowledgement=acknowledged-and-
  //                      flagged) has been engaged — not only once a
  //                      report has literally been published. An
  //                      unaddressed gap is exactly what the
  //                      publish-as-is DEFAULT would certify over on
  //                      the next scheduled report, so "doing nothing"
  //                      is never scored as if it were already safe.
  //   "untrustworthy" — either at least one currently-standing report
  //                      falsely certifies completeness the evidence
  //                      does not support, OR the degradation is active
  //                      with no safe remediation lever engaged yet.
  reportTrustStatus: "trustworthy",
  // Fleet-wide reconciliation tier, derived directly from
  // eventCompletenessPercent/orderingConfidencePercent and read by
  // scoring's dataIntegrity dimension via finalStringEquals — this is
  // what actually separates ACCEPTABLE (reconciliation not yet fully
  // drained, e.g. completeness 85-94%) from OPTIMAL (100%/100%) on the
  // one dimension that carries this scenario's real judgment, since
  // both tiers otherwise share the identical "trustworthy"/"intact"
  // pair. "full" (=100%/100%) / "partial" (<100%, no live violation) /
  // "violated" (a live violation is currently happening).
  evidenceReconciliationTier: "full",
  // Whether a falsely-clean compliance report has EVER been published
  // during this attempt (not merely "is one currently standing" — that
  // live framing is what reportTrustStatus already captures). Distinct
  // from reportTrustStatus precisely so a candidate who actually
  // published one or more falsely-clean reports (publish-as-is, or
  // publish-with-unverified-flag left unacknowledged) scores worse on
  // dataIntegrity than a candidate who merely left the degradation
  // unaddressed without ever publishing anything — the ACT of
  // certifying a false picture is a distinct, additional violation on
  // top of "a violation is currently live," mirroring how this
  // scenario's non-resetting incorrectlyCertifiedReportCount counter
  // tracks the same real-world distinction numerically.
  // "never-falsely-certified" / "falsely-certified" (permanent once
  // reached — never reverts for the rest of the attempt).
  reportCertificationStatus: "never-falsely-certified",
  //   "intact"      — the Immutable Store's append-only enforcement has
  //                    never been disabled during this attempt; no
  //                    previously-appended record has been rewritten.
  //   "compromised" — append-only enforcement has been disabled
  //                    (rewriteAllowed) at some point — a permanent,
  //                    non-resetting breach of the immutable-history
  //                    invariant for the rest of this attempt (see
  //                    definition.ts's numericWatchFields / rules.ts —
  //                    this status itself never reverts once reached).
  tamperEvidenceStatus: "intact",

  // ── Historical / cumulative damage (non-resetting, real
  // compliance exposure — the two REQUIRED independent counters) ──────
  // Cumulative count of audit events that became permanently
  // unverifiable (lost, corrupted, or stripped of trustworthy evidence)
  // during this attempt. Zero is healthy. This can only increase while
  // the degradation is active and no fallback evidence source is
  // engaged to recover a real gap — once an event's evidence is truly
  // gone, no later control change brings it back. See
  // definition.ts's numericWatchFields (trackPeak: true).
  unverifiableEventCount: 0,
  // Cumulative count of compliance reports that were published while
  // falsely certifying completeness the underlying evidence did not
  // support (i.e. published under reportTrustStatus="untrustworthy").
  // Zero is healthy. Each one is a real, already-sent, already-relied-
  // upon certification that cannot be un-sent — a permanent record
  // exposure distinct from the live unverifiable-event count above.
  incorrectlyCertifiedReportCount: 0,

  // ── Candidate-visible investigation/remediation state ───────────────
  // Whether the currently-open audit gap is explicitly flagged on
  // whatever has most recently been published (or is about to be). Read
  // together with reportPublicationMode. "not-applicable" before the
  // incident begins / once nothing remains unreconciled.
  auditGapDisclosureStatus: "not-applicable",

  // ── Historical/cumulative severity summary (derived, read by scoring
  // + severity bookkeeping) ────────────────────────────────────────────
  // Deliberately independent of Services/Audit Logger componentHealth
  // (which never leaves "healthy" in this scenario at all). Drives
  // reliability's criticalTimeRatio measure: time spent with evidence
  // integrity genuinely compromised, never time spent with availability
  // degraded.
  evidenceIntegritySeverity: "normal",
};
