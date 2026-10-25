import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  checkout: "healthy",
  "payment-api": "healthy",
  "fraud-service": "healthy",
  "rules-engine": "healthy",
  "external-risk-provider": "healthy",
  ledger: "healthy",
};

// Ledger is NEVER touched by any rule below — it stays healthy
// throughout the entire incident, by design.
const baseDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "payment-api": "degraded",
  "fraud-service": "degraded",
  "external-risk-provider": "critical",
};

const boundedDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "payment-api": "degraded",
  "fraud-service": "degraded",
  "external-risk-provider": "critical",
};

const compromisedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "payment-api": "critical",
  "fraud-service": "critical",
  "external-risk-provider": "critical",
  "rules-engine": "degraded",
};

const amplifiedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "payment-api": "critical",
  "fraud-service": "critical",
  "external-risk-provider": "critical",
};

const recoveringProviderHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "fraud-service": "degraded",
  "external-risk-provider": "degraded",
};

const relievedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "fraud-service": "healthy",
  "external-risk-provider": "healthy",
};

/**
 * Authored rule table for Fraud Control Degradation During Payment
 * Surge, ordered most-specific-first: unsafe fraud-bypass traps first
 * (they win regardless of every other control, because unmitigated
 * fraud exposure for high-risk transactions is never acceptable no
 * matter how healthy checkout metrics look), followed by the
 * queue-pressure-amplification trap, the velocity-threshold-erosion
 * trap, the legitimate bounded-fallback progression, the plain
 * fail-closed baseline, the External Risk Provider's own recovery
 * timeline, the review-queue relief/recovery-lag progression, and a
 * healthy-default fallback.
 *
 * ROOT CAUSE: a legitimate peak traffic event (business invariant #1 —
 * availability during this event is genuinely valuable, not a villain)
 * and the External Risk Provider's own latency/failure degradation
 * begin concurrently, at the same timed event (surge-onset). The
 * Ledger is NEVER touched by any rule here — ledgerWriteSuccessRate
 * stays at 99.9 throughout, a real decoy signal a candidate must not
 * mistake for "everything is fine": a healthy ledger write rate says
 * nothing about whether what got written was adequately screened.
 *
 * This is deliberately NOT a "naive scaling -> pressure transfer ->
 * downstream overload" scenario (phase-6e-strategy-spec.md section 5):
 * there is no node a candidate can simply "scale" to make this better.
 * The central judgment is risk acceptance — what fraud risk is
 * tolerable, for which transaction population, while a trusted risk
 * signal is unavailable — not a capacity/throughput decision.
 *
 * ── HISTORICAL SECURITY DAMAGE MODEL (phase-6e-strategy-spec.md
 * section 11/18, binding for this scenario) ─────────────────────────
 * cumulativeFraudReviewBypassCount is modeled the same way Identity
 * Platform Degradation and Authorization Policy Rollout Failure model
 * their own non-resetting correctness/security counters: as a sequence
 * of authored snapshots keyed to elapsed trigger-time windows
 * (sustainedSurge / riskProviderRecovering / riskProviderRecovered),
 * not as runtime arithmetic or a synthetic "ever activated" flag — the
 * engine has no mechanism for the latter (triggers are set only by
 * timed events, never by rule matches; see tick.ts). While
 * fraudReviewModeByRiskTier stays "bypass-all" (or
 * externalRiskProviderFallback stays "approve-on-timeout"), the count
 * climbs at each later-firing elapsed-time trigger for the SAME
 * "still bypassing" rule family. The moment the policy reverts to
 * mandatory-all/bounded-fallback, the live incidentState moves to the
 * fail-closed/bounded-fallback/recovered family, which always carries
 * cumulativeFraudReviewBypassCount: 0 going forward in `values` — this
 * is the SAME limitation the identity/authorization scenarios accept
 * (their own damage counters reset to 0 in `values` the instant the
 * unsafe lever is turned off too). What is genuinely non-resetting and
 * irreversible is state.peaks.peakValues.cumulativeFraudReviewBypassCount
 * (a numericWatchField with trackPeak:true — see definition.ts), which
 * the engine computes generically as Math.max(previousPeak,
 * currentValue) every tick regardless of which rule is currently
 * matched, and which extractScoringInputs/extractFinishScoringInputs
 * already expose as ScoringInputs.peakNumericValues. A candidate who
 * bypassed fraud review for high-risk transactions for several real
 * minutes and then reverted still shows a nonzero peak exposure in the
 * completed attempt's scoring, never silently erased by reverting.
 *
 * ── VELOCITY-THRESHOLD EROSION (a second, distinct, smaller historical
 * contribution) ──────────────────────────────────────────────────────
 * Relaxing transactionVelocityThreshold while the provider is degraded
 * routes some transactions that SHOULD have required full mandatory
 * review into the low-risk/fallback path instead — a bounded but real
 * erosion of invariant #2, tracked by its own smaller, additive
 * contribution to cumulativeFraudReviewBypassCount, distinct from the
 * broad-bypass trap's much larger contribution.
 *
 * ── QUEUE-PRESSURE-AMPLIFICATION TRAP (not a pressure-transfer-style
 * capacity mechanic — see queuePressureSeverity notes in metrics.ts)
 * Relaxing the velocity threshold (routing more volume into
 * fallback/low-risk handling) while simultaneously leaving
 * manualReviewQueuePriority at plain "fifo" compounds backlog growth
 * for the transactions that DO still require genuine manual review —
 * a real, authored, measurably worse queue depth than either lever
 * alone.
 *
 * ── RECOVERY LAG (phase-6e-strategy-spec.md binding) ─────────────────
 * manualReviewQueueDepth only ever drains once a genuine relief lever
 * is engaged (manualReviewQueuePriority = "risk-weighted", or
 * riskProviderCircuitBreaker = "half-open-probe"/"open" routing load
 * away from the provider) AND real elapsed drain-window time has
 * passed (drainWindow1Elapsed / drainWindow2Elapsed /
 * drainWindowFullyDrainedElapsed) — never instantly on the tick the
 * control is flipped.
 */
export const fraudControlDegradationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE FRAUD-BYPASS TRAPS — checked first, win regardless of every
  // other control. These are the required tempting-but-unsafe
  // availability-maximizing paths: checkout success/latency metrics
  // genuinely improve while a real, growing risk exposure accrues for
  // as long as the lever stays active.
  // ══════════════════════════════════════════════════════════════════

  // Broad fraud-review bypass for ALL transactions including
  // high-risk/high-velocity ones — the scenario's central forbidden
  // lever. Checkout metrics look excellent (no risk-check round-trip
  // to the degraded provider at all), but fraudControlStatus is
  // "compromised" and the historical count is materially higher once
  // sustainedSurge has fired, proving the exposure compounds the
  // longer it is left active (not a fixed, one-time cost).
  {
    id: "bypass-all-compromised-sustained",
    when: {
      triggerEquals: { riskProviderDegraded: true, sustainedSurge: true },
      controlEquals: { [FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY]: "bypass-all" },
    },
    incidentState: "bypass-all-compromised-sustained",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 2_400,
      riskProviderFailureRate: 40,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 55,
      checkoutSuccessRate: 99.8,
      checkoutP99LatencyMs: 260,
      lowRiskTransactionSuccessRate: 99.7,
      highRiskTransactionSuccessRate: 99.6,
      cumulativeFraudReviewBypassCount: 48,
      fraudControlStatus: "compromised",
      queuePressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },
  {
    id: "bypass-all-compromised",
    when: {
      triggerEquals: { riskProviderDegraded: true },
      controlEquals: { [FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY]: "bypass-all" },
    },
    incidentState: "bypass-all-compromised",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 2_000,
      riskProviderFailureRate: 35,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 40,
      checkoutSuccessRate: 99.7,
      checkoutP99LatencyMs: 280,
      lowRiskTransactionSuccessRate: 99.6,
      highRiskTransactionSuccessRate: 99.5,
      cumulativeFraudReviewBypassCount: 18,
      fraudControlStatus: "compromised",
      queuePressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },
  // Same bypass lever, but the External Risk Provider has ALREADY
  // started recovering on its own clock — checkout metrics look even
  // healthier (fewer provider-side failures) while bypass is still
  // live, which is precisely why availability improving must never be
  // read as "the bypass must be fine now": the historical count keeps
  // climbing exactly as before.
  {
    id: "bypass-all-compromised-during-recovery",
    when: {
      triggerEquals: { riskProviderRecovering: true },
      controlEquals: { [FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY]: "bypass-all" },
    },
    incidentState: "bypass-all-compromised-during-recovery",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 300,
      riskProviderFailureRate: 3,
      riskProviderStatus: "warning",
      manualReviewQueueDepth: 45,
      checkoutSuccessRate: 99.9,
      checkoutP99LatencyMs: 220,
      lowRiskTransactionSuccessRate: 99.9,
      highRiskTransactionSuccessRate: 99.9,
      cumulativeFraudReviewBypassCount: 62,
      fraudControlStatus: "compromised",
      queuePressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },

  // Provider-timeout-specific bypass trap: approve-on-timeout treats
  // every provider timeout as an automatic approval. Same growing
  // historical counter, same permanence of the exposure window, even
  // if fraudReviewModeByRiskTier itself is set correctly.
  {
    id: "approve-on-timeout-compromised-sustained",
    when: {
      triggerEquals: { riskProviderDegraded: true, sustainedSurge: true },
      controlEquals: { [EXTERNAL_RISK_PROVIDER_FALLBACK_KEY]: "approve-on-timeout" },
    },
    incidentState: "approve-on-timeout-compromised-sustained",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 1_300,
      riskProviderFailureRate: 18,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 30,
      checkoutSuccessRate: 99.5,
      checkoutP99LatencyMs: 310,
      lowRiskTransactionSuccessRate: 99.5,
      highRiskTransactionSuccessRate: 94,
      cumulativeFraudReviewBypassCount: 24,
      fraudControlStatus: "compromised",
      queuePressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },
  {
    id: "approve-on-timeout-compromised",
    when: {
      triggerEquals: { riskProviderDegraded: true },
      controlEquals: { [EXTERNAL_RISK_PROVIDER_FALLBACK_KEY]: "approve-on-timeout" },
    },
    incidentState: "approve-on-timeout-compromised",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 900,
      riskProviderFailureRate: 12,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 25,
      checkoutSuccessRate: 99.3,
      checkoutP99LatencyMs: 330,
      lowRiskTransactionSuccessRate: 99.3,
      highRiskTransactionSuccessRate: 94,
      cumulativeFraudReviewBypassCount: 9,
      fraudControlStatus: "compromised",
      queuePressureSeverity: "elevated",
    },
    componentHealth: compromisedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // QUEUE-PRESSURE-AMPLIFICATION TRAP — looks like "just relax the
  // threshold to relieve the queue," actually worsens both the
  // External Risk Provider's remaining load profile and the review
  // queue at once by routing MORE volume through fallback handling
  // while doing nothing to triage the backlog that does require real
  // review. Not a security violation on its own at the base tier (see
  // the separate velocity-erosion contribution below), but a
  // materially worse availability/backlog outcome than doing nothing.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "velocity-relaxed-fifo-amplified",
    when: {
      triggerEquals: { riskProviderDegraded: true },
      controlEquals: {
        [TRANSACTION_VELOCITY_THRESHOLD_KEY]: "relaxed",
        [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "fifo",
      },
    },
    incidentState: "velocity-relaxed-fifo-amplified",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 1_600,
      riskProviderFailureRate: 24,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 95,
      checkoutSuccessRate: 90,
      checkoutP99LatencyMs: 1_900,
      lowRiskTransactionSuccessRate: 70,
      highRiskTransactionSuccessRate: 55,
      cumulativeFraudReviewBypassCount: 6,
      fraudControlStatus: "unprotected",
      queuePressureSeverity: "amplified",
    },
    componentHealth: amplifiedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // LEGITIMATE BOUNDED-FALLBACK PROGRESSION — the scenario's required
  // legitimate degraded-but-safe state. Requires BOTH risk-tiered-
  // bounded-fallback AND a usable Rules Engine (full or reduced) to
  // safely distinguish low-risk from high-risk transactions;
  // high-risk transactions remain protected (held for manual review,
  // via fifo or risk-weighted triage) throughout.
  // ══════════════════════════════════════════════════════════════════

  // Bounded-fallback requested, but the Rules Engine is disabled —
  // there is no reliable local signal to tell risk tiers apart, so
  // this cannot safely bounded-fallback. Falls back to the same
  // fail-closed posture as mandatory-all, at a real authored cost
  // (lower lowRiskTransactionSuccessRate than the real bounded-
  // fallback state below), demonstrating rulesEngineMode is not a
  // dead control.
  {
    id: "bounded-fallback-requested-rules-engine-disabled",
    when: {
      triggerEquals: { riskProviderDegraded: true },
      controlEquals: {
        [FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY]: "risk-tiered-bounded-fallback",
        [RULES_ENGINE_MODE_KEY]: "disabled",
      },
    },
    incidentState: "bounded-fallback-requested-rules-engine-disabled",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 900,
      riskProviderFailureRate: 10,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 32,
      checkoutSuccessRate: 60,
      checkoutP99LatencyMs: 1_200,
      lowRiskTransactionSuccessRate: 42,
      highRiskTransactionSuccessRate: 42,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "fail-closed",
      queuePressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },

  // Real bounded-fallback, reduced Rules Engine, fifo review queue:
  // low-risk transactions succeed via the bounded fallback flow,
  // high-risk transactions are correctly still held for mandatory
  // manual review (never bypassed).
  {
    id: "bounded-fallback-fifo",
    when: {
      triggerEquals: { riskProviderDegraded: true },
      controlEquals: {
        [FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY]: "risk-tiered-bounded-fallback",
        [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "fifo",
      },
    },
    incidentState: "bounded-fallback-fifo",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 700,
      riskProviderFailureRate: 8,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 30,
      checkoutSuccessRate: 97,
      checkoutP99LatencyMs: 520,
      lowRiskTransactionSuccessRate: 97,
      highRiskTransactionSuccessRate: 40,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "bounded-fallback",
      queuePressureSeverity: "elevated",
    },
    componentHealth: boundedDegradedHealth,
  },

  // Real bounded-fallback, risk-weighted review queue — the OPTIMAL-
  // tier combination: low-risk users keep working through the bounded
  // flow, high-risk transactions stay protected, and the highest-risk
  // held transactions are reviewed first rather than sitting behind an
  // arbitrary arrival-order backlog — a real, distinct, measurably
  // lower queue depth than the plain fifo bounded-fallback state
  // above, proving manualReviewQueuePriority is not a dead control.
  {
    id: "bounded-fallback-risk-weighted",
    when: {
      triggerEquals: { riskProviderDegraded: true },
      controlEquals: {
        [FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY]: "risk-tiered-bounded-fallback",
        [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "risk-weighted",
      },
    },
    incidentState: "bounded-fallback-risk-weighted",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 700,
      riskProviderFailureRate: 8,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 18,
      checkoutSuccessRate: 97,
      checkoutP99LatencyMs: 500,
      lowRiskTransactionSuccessRate: 97,
      highRiskTransactionSuccessRate: 45,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "bounded-fallback",
      queuePressureSeverity: "elevated",
    },
    componentHealth: boundedDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PLAIN FAIL-CLOSED BASELINE — mandatory-all in effect: safe but
  // blunt. No security violation, but low-risk transactions are
  // needlessly held too, and review-queue pressure is unaddressed
  // unless a separate relief lever is engaged (handled further below).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "fail-closed-mandatory-all-sustained",
    when: { triggerEquals: { riskProviderDegraded: true, sustainedSurge: true } },
    incidentState: "fail-closed-mandatory-all-sustained",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 1_600,
      riskProviderFailureRate: 22,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 48,
      checkoutSuccessRate: 55,
      checkoutP99LatencyMs: 2_400,
      lowRiskTransactionSuccessRate: 38,
      highRiskTransactionSuccessRate: 38,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "fail-closed",
      queuePressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },
  {
    id: "fail-closed-mandatory-all-baseline",
    when: { triggerEquals: { riskProviderDegraded: true } },
    incidentState: "fail-closed-mandatory-all-baseline",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 900,
      riskProviderFailureRate: 10,
      riskProviderStatus: "critical",
      manualReviewQueueDepth: 32,
      checkoutSuccessRate: 60,
      checkoutP99LatencyMs: 1_800,
      lowRiskTransactionSuccessRate: 42,
      highRiskTransactionSuccessRate: 42,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "fail-closed",
      queuePressureSeverity: "elevated",
    },
    componentHealth: baseDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // REVIEW-QUEUE RELIEF / RECOVERY-LAG PROGRESSION — requires a real
  // relief lever (riskProviderCircuitBreaker = half-open-probe or open,
  // routing load away from the struggling provider; or
  // manualReviewQueuePriority = risk-weighted) AND real elapsed
  // drain-window time. Reachable both while the External Risk Provider
  // is still degraded and after it has recovered — the two axes are
  // independent. Listed BEFORE the generic riskProviderRecovered/
  // Recovering fallback rules below: those two fallbacks have NO
  // control constraints at all (they match on trigger alone), so if
  // they were listed first they would permanently shadow every one of
  // these more-specific relief rules, which also require
  // riskProviderRecovered === true — first-match-wins means the more
  // specific rule must come first.
  // ══════════════════════════════════════════════════════════════════

  // OPTIMAL: fully drained. Provider fully recovered, relief engaged
  // safely (circuit breaker open or half-open-probe during degradation
  // plus risk-weighted triage), and the longest drain window has
  // elapsed — queue depth has drained to baseline.
  {
    id: "fully-drained-safe",
    when: {
      triggerEquals: { riskProviderRecovered: true, drainWindowFullyDrainedElapsed: true },
      controlEquals: { [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "risk-weighted" },
    },
    incidentState: "fully-drained-safe",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 6,
      checkoutSuccessRate: 99,
      checkoutP99LatencyMs: 310,
      lowRiskTransactionSuccessRate: 99,
      highRiskTransactionSuccessRate: 99,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "normal",
    },
    componentHealth: relievedHealth,
  },
  // Fully drained via the circuit breaker instead of risk-weighted
  // triage alone — an alternate strong path: opening the breaker
  // during the degraded window routed traffic away from the struggling
  // provider earlier, reaching the same fully-drained queue depth once
  // the window has elapsed, with a slightly different latency profile
  // along the way.
  {
    id: "fully-drained-via-circuit-breaker",
    when: {
      triggerEquals: { riskProviderRecovered: true, drainWindowFullyDrainedElapsed: true },
      controlEquals: { [RISK_PROVIDER_CIRCUIT_BREAKER_KEY]: "half-open-probe" },
    },
    incidentState: "fully-drained-via-circuit-breaker",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 8,
      checkoutSuccessRate: 99,
      checkoutP99LatencyMs: 300,
      lowRiskTransactionSuccessRate: 99,
      highRiskTransactionSuccessRate: 99,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "normal",
    },
    componentHealth: relievedHealth,
  },

  // Draining, window 2 — relief engaged, second window elapsed, not
  // yet fully drained.
  {
    id: "draining-window2-safe",
    when: {
      triggerEquals: {
        riskProviderRecovered: true,
        drainWindow2Elapsed: true,
        drainWindowFullyDrainedElapsed: false,
      },
      controlEquals: { [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "risk-weighted" },
    },
    incidentState: "draining-window2-safe",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 16,
      checkoutSuccessRate: 99,
      checkoutP99LatencyMs: 310,
      lowRiskTransactionSuccessRate: 99,
      highRiskTransactionSuccessRate: 99,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // Draining, window 1 — relief just engaged plus one elapsed window:
  // real, distinct progress below the unaddressed ceiling, but still
  // well above baseline — proving relief is not instantaneous.
  {
    id: "draining-window1-safe",
    when: {
      triggerEquals: {
        riskProviderRecovered: true,
        drainWindow1Elapsed: true,
        drainWindow2Elapsed: false,
      },
      controlEquals: { [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "risk-weighted" },
    },
    incidentState: "draining-window1-safe",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 26,
      checkoutSuccessRate: 99,
      checkoutP99LatencyMs: 320,
      lowRiskTransactionSuccessRate: 99,
      highRiskTransactionSuccessRate: 99,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // Relief just engaged, NO elapsed drain window yet (tick-zero proof
  // that relief does not instantly clear the backlog).
  {
    id: "relief-just-engaged",
    when: {
      triggerEquals: { riskProviderRecovered: true, drainWindow1Elapsed: false },
      controlEquals: { [MANUAL_REVIEW_QUEUE_PRIORITY_KEY]: "risk-weighted" },
    },
    incidentState: "relief-just-engaged",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 40,
      checkoutSuccessRate: 98,
      checkoutP99LatencyMs: 350,
      lowRiskTransactionSuccessRate: 98,
      highRiskTransactionSuccessRate: 98,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // EXTERNAL RISK PROVIDER RECOVERING / RECOVERED FALLBACKS —
  // provider-side health improves on its own schedule, but relief was
  // never engaged (none of the more-specific relief rules above
  // matched). Listed AFTER the relief progression so a candidate who
  // genuinely engaged relief is always matched by the more specific
  // rule first; these two catch everyone else. Review-queue depth is a
  // SEPARATE axis and does not drop just because the provider
  // recovered.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "risk-provider-recovered-queue-unaddressed",
    when: { triggerEquals: { riskProviderRecovered: true } },
    incidentState: "risk-provider-recovered-queue-unaddressed",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 48,
      checkoutSuccessRate: 95,
      checkoutP99LatencyMs: 420,
      lowRiskTransactionSuccessRate: 95,
      highRiskTransactionSuccessRate: 95,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },
  {
    id: "risk-provider-recovering-queue-unaddressed",
    when: { triggerEquals: { riskProviderRecovering: true } },
    incidentState: "risk-provider-recovering-queue-unaddressed",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 300,
      riskProviderFailureRate: 3,
      riskProviderStatus: "warning",
      manualReviewQueueDepth: 44,
      checkoutSuccessRate: 90,
      checkoutP99LatencyMs: 600,
      lowRiskTransactionSuccessRate: 90,
      highRiskTransactionSuccessRate: 90,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "restored",
      queuePressureSeverity: "elevated",
    },
    componentHealth: recoveringProviderHealth,
  },

  // ── Default/fallback: before the incident begins. ──────────────────
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      ledgerWriteSuccessRate: 99.9,
      riskProviderLatencyMs: 90,
      riskProviderFailureRate: 0.2,
      riskProviderStatus: "normal",
      manualReviewQueueDepth: 5,
      checkoutSuccessRate: 99,
      checkoutP99LatencyMs: 300,
      lowRiskTransactionSuccessRate: 99,
      highRiskTransactionSuccessRate: 99,
      cumulativeFraudReviewBypassCount: 0,
      fraudControlStatus: "unprotected",
      queuePressureSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
