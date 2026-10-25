import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { fraudControlDegradationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  EXTERNAL_RISK_PROVIDER_FALLBACK_KEY,
  FRAUD_REVIEW_MODE_BY_RISK_TIER_KEY,
  MANUAL_REVIEW_QUEUE_PRIORITY_KEY,
  RISK_PROVIDER_CIRCUIT_BREAKER_KEY,
  RULES_ENGINE_MODE_KEY,
  TRANSACTION_VELOCITY_THRESHOLD_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const fraudControlDegradationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "riskProviderStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The External Risk Provider has entered a critical degraded state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The External Risk Provider has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "manualReviewQueueDepth",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The manual review queue has crossed 50 held transactions.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The manual review queue has dropped back below 50.",
      },
    },
    {
      // HISTORICAL/CUMULATIVE security damage (phase-6e-strategy-spec.md
      // section 11/18, binding). trackPeak:true is what makes this
      // genuinely non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate reverts the unsafe lever and `values.
      // cumulativeFraudReviewBypassCount` returns to 0, the peak the
      // attempt actually reached stays recorded and is what scoring
      // reads (see rules.ts's historical-damage-model comment and
      // scoring.ts's dataIntegrity/reliability penalties).
      key: "cumulativeFraudReviewBypassCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "A high-risk or high-velocity transaction has cleared checkout without mandatory fraud review.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "High-risk transactions are no longer clearing checkout without mandatory fraud review.",
      },
    },
    {
      key: "riskProviderFailureRate",
      trackPeak: true,
    },
    {
      key: "checkoutP99LatencyMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: fraudControlDegradationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase-6e-strategy-spec.md section 16, same
  // style/rigor as identity-platform-degradation/definition.ts) ───────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (manualReviewQueueDepth / riskProviderStatus /
  // fraudControlStatus / cumulativeFraudReviewBypassCount):
  //
  //   fail-closed-mandatory-all-baseline          UNSAFE  32 / critical / fail-closed / 0
  //   fail-closed-mandatory-all-sustained         UNSAFE  48 / critical / fail-closed / 0
  //   bounded-fallback-requested-rules-engine-disabled
  //                                                UNSAFE  32 / critical / fail-closed / 0
  //     (falls back to fail-closed outcomes at a real authored cost —
  //     proves rulesEngineMode is not a dead control: lowRiskTransaction
  //     SuccessRate is 42 here, identical to mandatory-all, vs 97 in
  //     the real bounded-fallback states below)
  //   velocity-relaxed-fifo-amplified             UNSAFE  95 / critical / unprotected / 6
  //     (queue-pressure-amplification trap: worse on availability than
  //     doing nothing, AND a small but real erosion of mandatory review
  //     coverage via the relaxed velocity threshold)
  //   bypass-all-compromised                      UNSAFE  40 / critical / compromised / 18
  //   bypass-all-compromised-sustained            UNSAFE  55 / critical / compromised / 48
  //   bypass-all-compromised-during-recovery      UNSAFE  45 / warning  / compromised / 62
  //     (best-looking checkout numbers in the ENTIRE scenario —
  //     checkoutSuccessRate 99.9, lowRiskTransactionSuccessRate 99.9 —
  //     yet the single worst dataIntegrity/reliability outcome; see the
  //     score-sanity audit below)
  //   approve-on-timeout-compromised(-sustained)  UNSAFE  25-30 / critical / compromised / 9-24
  //   bounded-fallback-fifo                       ACCEPTABLE 30 / critical / bounded-fallback / 0
  //   bounded-fallback-risk-weighted              ACCEPTABLE 18 / critical / bounded-fallback / 0
  //   risk-provider-recovering-queue-unaddressed  UNSAFE  44 / warning / restored / 0
  //   risk-provider-recovered-queue-unaddressed   UNSAFE  48 / normal  / restored / 0
  //     (provider fully healthy again, but review-queue depth is a
  //     SEPARATE axis that was never addressed — proves "the root cause
  //     recovered" is not the same as "the system is safe to hand back")
  //   relief-just-engaged                         UNSAFE  40 / normal / restored / 0
  //   draining-window1-safe                       UNSAFE  26 / normal / restored / 0
  //   draining-window2-safe                       UNSAFE  16 / normal / restored / 0
  //   fully-drained-safe                          OPTIMAL 6 / normal / restored / 0
  //   fully-drained-via-circuit-breaker            OPTIMAL 8 / normal / restored / 0
  //
  // ── Why the two bounded-fallback states are ACCEPTABLE, not UNSAFE ──
  // Both have fraudControlStatus === "bounded-fallback" (the one and
  // only value this field ever takes when low-risk transactions are
  // using the explicitly-allowed fallback flow while high-risk
  // transactions remain genuinely protected) and
  // cumulativeFraudReviewBypassCount === 0 — no security violation has
  // occurred, ever, in either state. This is the scenario's required
  // legitimate degraded-but-safe state (phase-6e-strategy-spec.md's
  // explicit encouragement): low-risk users get a real, policy-allowed
  // degraded flow, and high-risk transactions are held for mandatory
  // manual review (never bypassed) rather than exposed. This is NOT
  // "almost fixed" — it is a deliberate, bounded risk-acceptance
  // tradeoff a Principal engineer is expected to choose and be willing
  // to hand back, even though the External Risk Provider itself has
  // not fully recovered and the review queue has not fully drained.
  //
  // ── Why risk-provider-recovered-queue-unaddressed is UNSAFE despite
  // the provider showing fully "normal" ───────────────────────────────
  // manualReviewQueueDepth sits at 48 — above the acceptable ceiling of
  // 15 — because queue drain is a genuinely separate mechanism from
  // External Risk Provider recovery (two independently-caused concurrent
  // conditions per the incident's own framing: a legitimate peak event
  // plus a provider degradation). A candidate who stops watching once
  // the provider's own dashboard turns green would wrongly conclude the
  // system is safe; this state exists specifically to catch that
  // mistake.
  //
  // ── Why the bypass-all/approve-on-timeout family is UNSAFE regardless
  // of how healthy checkout looks (phase-6e-strategy-spec.md section
  // 11's binding security requirement) ─────────────────────────────────
  // fraudControlStatus === "compromised" fails successCondition's
  // explicit fraudControlStatus !== "compromised" check and
  // acceptableCondition's explicit fraudControlStatus === "bounded-
  // fallback" check — both directly, regardless of
  // lowRiskTransactionSuccessRate/highRiskTransactionSuccessRate
  // reading 99.9. This scenario can therefore never resolve as safe via
  // this path, in any tier, however long the candidate waits or however
  // good the other metrics look. If left active long enough
  // (cumulativeFraudReviewBypassCount >= 40, sustained 45s — reachable
  // via bypass-all-compromised-sustained's 48 or bypass-all-compromised-
  // during-recovery's 62), the automatic failureCondition fires —
  // failure is never gated by completion mode (tick.ts), so a candidate
  // cannot simply decline to Finish and wait out a live, worsening
  // fraud-exposure violation.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "fail-closed but blunt" (UNSAFE — holds low-risk
  // transactions needlessly) and "bounded-fallback" (ACCEPTABLE — a
  // deliberate, genuinely safe risk-acceptance tradeoff) is a real
  // system-state distinction, but deciding WHETHER that bounded tradeoff
  // is safe enough to hand back — as opposed to continuing to wait for
  // the External Risk Provider to fully recover and the review queue to
  // fully drain into the OPTIMAL state — is a genuine Principal-level
  // judgment call, not something the engine should auto-resolve the
  // instant a threshold is crossed. This mirrors Identity Platform
  // Degradation's and Authorization Policy Rollout Failure's
  // completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions: the matched rule is fail-closed-mandatory-all-baseline
  // (manualReviewQueueDepth 32, fraudControlStatus "fail-closed"),
  // which satisfies neither successCondition (queue depth 32 > 15) nor
  // acceptableCondition (fraudControlStatus !== "bounded-fallback").
  // evaluateCandidateDeclaredFinish therefore returns
  // outcome: "declared_unstable" — the expected default per
  // phase-6e-strategy-spec.md's immediate-Finish audit requirement.
  // There is no observation-only sustained-stability strategy for this
  // scenario: doing nothing leaves mandatory review correctly in effect
  // (safe) but leaves manualReviewQueueDepth climbing past the
  // acceptable ceiling, so standing still is never itself a path to a
  // completable state.
  completion: { mode: "candidate_declared", acceptableCondition },
};
