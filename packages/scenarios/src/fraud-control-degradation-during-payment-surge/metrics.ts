import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Decoy-healthy signal ─────────────────────────────────────────
  // The Ledger never degrades in this scenario, by design — a
  // candidate who only watches ledger write success concludes nothing
  // serious is wrong, which is exactly the misleading first read this
  // scenario is built around: a healthy ledger write rate says nothing
  // about whether what got written was adequately screened for fraud.
  ledgerWriteSuccessRate: 99.9,

  // ── External Risk Provider health ────────────────────────────────
  riskProviderLatencyMs: 90,
  riskProviderFailureRate: 0.2,
  riskProviderStatus: "normal",

  // ── Checkout / Payment API throughput (the legitimate peak event's
  // own real traffic — availability here is genuinely valuable, not a
  // villain, per business invariant #1) ───────────────────────────
  checkoutSuccessRate: 99,
  checkoutP99LatencyMs: 300,

  // ── Transaction outcomes by risk tier ────────────────────────────
  lowRiskTransactionSuccessRate: 99,
  highRiskTransactionSuccessRate: 99,
  manualReviewQueueDepth: 5,

  // ── HISTORICAL / CUMULATIVE security damage (phase-6e-strategy-spec
  // section 11/18's required historical-damage model for this
  // scenario). Only ever increases while an unsafe-bypass lever is
  // active; never reset by restoring policy afterward — see rules.ts
  // and definition.ts's completion-mode audit for the explicit
  // non-reset proof (state.peaks.peakValues, a Math.max running
  // maximum the engine computes every tick regardless of which rule
  // currently matches). Scoped specifically to transactions that
  // SHOULD have required mandatory fraud review but did not receive it.
  cumulativeFraudReviewBypassCount: 0,

  // Generic string-state field read by scoring's dataIntegrity measure
  // and by successCondition/acceptableCondition — the single
  // authoritative summary of "what kind of fraud-control security
  // state is this."
  //   "unprotected"       — the incident is active and no adequate
  //                         policy is in effect yet (mandatory-all is
  //                         SAFE but not sufficient on its own to
  //                         resolve the incident; "unprotected" here
  //                         specifically means low-risk transactions
  //                         are being needlessly delayed/held or
  //                         queue pressure is unaddressed).
  //   "fail-closed"        — mandatory-all is in effect: safe, but
  //                         blunt — both low- and high-risk
  //                         transactions requiring review are held
  //                         while the provider is degraded.
  //   "bounded-fallback"   — the legitimate degraded state: low-risk
  //                         transactions use the explicitly-allowed
  //                         bounded fallback risk-check mode,
  //                         high-risk transactions remain fully
  //                         protected (held for manual review or hard
  //                         blocked, never bypassed).
  //   "compromised"        — a fraud-review-bypass lever is currently
  //                         active for high-risk transactions.
  //                         Permanent, cumulative risk exposure in
  //                         progress.
  //   "restored"           — the External Risk Provider has fully
  //                         recovered and normal mandatory-all review
  //                         is back in effect for everyone, with no
  //                         bypass ever active.
  fraudControlStatus: "unprotected",

  // Generic string-state field read by scoring's reliability dimension,
  // isolating the queue-backlog trap's severity from ordinary
  // criticalTimeRatio — the generic scorer has no numeric-threshold
  // penalty measure for an arbitrary field like manualReviewQueueDepth,
  // only finalStringEquals/NotEquals on a string field (schema.ts), so
  // this closed three-value enumeration exists specifically to let
  // scoring distinguish "queue pressure is climbing on its own" from
  // "queue pressure was actively made worse by a candidate choice that
  // widened the velocity threshold without adding review throughput."
  //   "normal"    — no queue-pressure-amplifying lever is active.
  //   "elevated"  — ordinary incident pressure (fail-closed baseline,
  //                 sustained surge, relief not yet engaged).
  //   "amplified" — the relaxed-velocity-threshold trap is actively
  //                 routing more transactions into the low-risk/
  //                 fallback path while review-queue triage is left
  //                 at plain FIFO, compounding backlog growth.
  queuePressureSeverity: "normal",
};
