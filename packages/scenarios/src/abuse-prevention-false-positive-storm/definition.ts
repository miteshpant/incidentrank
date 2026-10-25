import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { abusePreventionFalsePositiveStormRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  ABUSE_TRAFFIC_BLOCK_KEY,
  DETECTION_RULE_VERSION_KEY,
  FALSE_POSITIVE_EXEMPTION_KEY,
  IDENTITY_TRUST_SCORING_KEY,
  RATE_LIMITER_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const abusePreventionFalsePositiveStormSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "cumulativeAbuseRequestsAllowedCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Real abusive traffic has begun being allowed through as a direct result of a broad enforcement bypass.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Abusive traffic is no longer being allowed through by a broad bypass.",
      },
    },
    {
      key: "legitimateUsersBlockedCount",
      trackPeak: true,
      threshold: {
        value: 500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The legitimate-user population blocked by the faulty detection rule has crossed 500.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The legitimate-user blocked population has dropped back below 500.",
      },
    },
    {
      key: "abuseRequestsAllowedRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: abusePreventionFalsePositiveStormRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase-6e-strategy-spec.md section 16,
  // same style/rigor as distributed-coordination-failure/definition.ts
  // and identity-platform-degradation/definition.ts) ──────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (legitimateUserSuccessRate / abuseProtectionStatus /
  // cumulativeAbuseRequestsAllowedCount):
  //
  //   false-positives-baseline                   UNSAFE  64 / false-positives-active / 0
  //   false-positives-sustained-unaddressed       UNSAFE  58 / false-positives-active / 0
  //   abuse-signal-disabled                       UNSAFE  62 / protection-bypassed / 180
  //     (independent abuse signal turned off while the rate limiter
  //     stays "strict" — proves abuseTrafficBlock is a genuinely
  //     separate axis from rateLimiterMode, not a dead control)
  //   exemption-unreliable                        UNSAFE  88 / protection-bypassed / 95
  //     (exemption granted without a live trust signal — cannot
  //     reliably tell a real false positive from a real abuser in the
  //     same flagged population)
  //   rate-limiter-relaxed                        UNSAFE  91 / protection-bypassed / 260
  //   rate-limiter-relaxed-sustained               UNSAFE  94 / protection-bypassed / 980
  //   rate-limiter-disabled                       UNSAFE  99.5 / protection-bypassed / 640
  //   rate-limiter-disabled-sustained              UNSAFE  99.6 / protection-bypassed / 2_400
  //   rate-limiter-disabled-during-investigation  UNSAFE  99.7 / protection-bypassed / 3_100
  //     (best-looking availability numbers in the ENTIRE scenario —
  //     legitimateUserSuccessRate at 99.5-99.7 — yet the single worst
  //     dataIntegrity outcome; see the security-QA audit below)
  //   exemption-safe                              ACCEPTABLE 97 / targeted-fix-applied / 0
  //   targeted-rollback-fixed                     OPTIMAL 99.4 / fully-restored / 0
  //   patched-forward-fix                         OPTIMAL 99.6 / fully-restored / 0
  //
  // ── Why exemption-safe is ACCEPTABLE, not UNSAFE ─────────────────────
  // abuseProtectionStatus === "targeted-fix-applied" (the one and only
  // value this field ever takes when the specifically-flagged
  // legitimate population is exempted using a live trust signal, while
  // real abuse screening and the independent abuse signal both remain
  // fully intact) and cumulativeAbuseRequestsAllowedCount === 0 — no
  // security violation has occurred, ever, in this state. This is the
  // scenario's required legitimate degraded-but-safe state (phase-6e-
  // strategy-spec.md's explicit encouragement): the affected population
  // gets relief while investigation into the underlying rule defect
  // continues, without touching enforcement for anyone else. This is
  // NOT "almost fixed" — it is a deliberate, bounded tradeoff a Senior
  // Staff engineer is expected to choose and be willing to hand back,
  // even though the detection rule itself has not yet been repaired.
  //
  // ── Why the bypass/relaxation family is UNSAFE regardless of how
  // healthy legitimate-user availability looks (phase-6e-strategy-spec.md
  // section 11's binding security-QA requirement) ─────────────────────
  // abuseProtectionStatus === "protection-bypassed" fails
  // successCondition's explicit abuseProtectionStatus === "fully-
  // restored" check and acceptableCondition's explicit
  // abuseProtectionStatus === "targeted-fix-applied" check — both
  // directly, regardless of legitimateUserSuccessRate reading 99.5+.
  // This scenario can therefore never resolve as safe via this path, in
  // any tier, however long the candidate waits or however good
  // legitimate-user availability looks. If left active long enough
  // (cumulativeAbuseRequestsAllowedCount >= 2_000, sustained 45s —
  // reachable via rate-limiter-disabled-sustained's 2_400 or
  // rate-limiter-disabled-during-investigation's 3_100), the automatic
  // failureCondition fires — failure is never gated by completion mode
  // (tick.ts), so a candidate cannot simply decline to Finish and wait
  // out a live, worsening abuse-exposure violation.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "strict enforcement but blunt" (UNSAFE — blocks
  // legitimate users needlessly) and "targeted exemption applied"
  // (ACCEPTABLE — a deliberate, genuinely safe tradeoff) is a real
  // system-state distinction, but deciding WHETHER that bounded
  // tradeoff is safe enough to hand back — as opposed to continuing to
  // pursue the full rule fix — is a genuine Senior-Staff-level judgment
  // call, not something the engine should auto-resolve the instant a
  // threshold is crossed. This mirrors identity-platform-degradation's
  // and authorization-policy-rollout-failure's completion-mode
  // reasoning exactly.
  completion: { mode: "candidate_declared", acceptableCondition },
};
