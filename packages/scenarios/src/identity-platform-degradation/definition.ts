import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { identityPlatformDegradationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  LOGIN_CONCURRENCY_LIMIT_KEY,
  MFA_POLICY_BY_RISK_TIER_KEY,
  MFA_RETRY_BACKOFF_KEY,
  PRIVILEGED_ACTION_MODE_KEY,
  RISK_ENGINE_MODE_KEY,
  SESSION_CACHE_MODE_KEY,
  SESSION_TTL_SECONDS_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const identityPlatformDegradationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "mfaProviderStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The MFA Provider has entered a critical degraded state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The MFA Provider has recovered.",
      },
    },
    {
      key: "sessionStoreStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Session Store pressure has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Session Store pressure has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "sessionStorePressureLevel",
      trackPeak: true,
      threshold: {
        value: 50,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Session Store pressure has crossed 50.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Session Store pressure has dropped back below 50.",
      },
    },
    {
      key: "highRiskActionsAuthenticatedWithoutMfaCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "A high-risk or privileged action has been authenticated without mandatory MFA.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "High-risk actions are no longer being authenticated without MFA.",
      },
    },
    {
      key: "activeSessionsUnnecessarilyInvalidatedCount",
      trackPeak: true,
    },
    {
      key: "mfaProviderFailureRate",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: identityPlatformDegradationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d3.md section 10, same style/rigor
  // as distributed-coordination-failure/definition.ts) ────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (sessionStorePressureLevel / mfaProviderStatus /
  // authSecurityStatus / activeSessionsUnnecessarilyInvalidatedCount /
  // highRiskActionsAuthenticatedWithoutMfaCount):
  //
  //   fail-closed-mandatory-all-baseline         UNSAFE  32 / critical / fail-closed / 0 / 0
  //   fail-closed-mandatory-all-sustained        UNSAFE  48 / critical / fail-closed / 0 / 0
  //   bounded-degrade-requested-risk-engine-disabled
  //                                               UNSAFE  32 / critical / fail-closed / 0 / 0
  //     (falls back to fail-closed outcomes at a real authored cost —
  //     proves riskEngineMode is not a dead control: lowRiskLoginSuccessRate
  //     is 42 here, identical to mandatory-all, vs 97 in the real
  //     bounded-degrade states below)
  //   relief-eviction-without-token-protection   UNSAFE  38 / critical / unprotected / 65 / 0
  //     (invariant #5 violation: real, nonzero unnecessary invalidation)
  //   pressure-amplified-retries-and-concurrency UNSAFE  92 / critical / unprotected / 0 / 0
  //     (pressure-transfer trap: worse on BOTH axes than doing nothing)
  //   pressure-amplified-retries-concurrency-and-short-ttl
  //                                               UNSAFE  99 / critical / unprotected / 0 / 0
  //     (stacking a short session TTL on the amplification trap makes
  //     it measurably worse still — proves sessionTtlSeconds is not a
  //     dead control)
  //   mfa-bypass-all-compromised                 UNSAFE  40 / critical / compromised / 0 / 18
  //   mfa-bypass-all-compromised-sustained       UNSAFE  55 / critical / compromised / 0 / 48
  //   mfa-bypass-all-compromised-during-recovery UNSAFE  50 / warning  / compromised / 0 / 62
  //     (best-looking availability numbers in the ENTIRE scenario —
  //     lowRiskLoginSuccessRate/highRiskLoginSuccessRate at 99.9 — yet
  //     the single worst dataIntegrity/reliability outcome; see the
  //     security-QA audit below)
  //   privileged-allow-with-cached-risk-compromised(-sustained)
  //                                               UNSAFE  35-42 / critical / compromised / 0 / 9-24
  //   bounded-degrade-protected-privileged       ACCEPTABLE 30 / critical / bounded-degraded / 0 / 0
  //   bounded-degrade-privileged-unavailable     ACCEPTABLE 30 / critical / bounded-degraded / 0 / 0
  //   mfa-provider-recovering-pressure-unaddressed UNSAFE 55 / warning / restored / 0 / 0
  //   mfa-provider-recovered-pressure-unaddressed  UNSAFE 60 / normal  / restored / 0 / 0
  //     (provider fully healthy again, but session-store pressure is a
  //     SEPARATE axis that was never addressed — proves "the root cause
  //     recovered" is not the same as "the system is safe to hand back")
  //   relief-just-engaged                        UNSAFE  60 / normal / restored / 0 / 0
  //   relief-draining-window1-safe                UNSAFE  40 / normal / restored / 0 / 0
  //   relief-draining-window1-extended-ttl        UNSAFE  28 / normal / restored / 0 / 0
  //     (extended session TTL reaches a lower pressure level than the
  //     default-TTL window-1 state above at the SAME elapsed window —
  //     proves sessionTtlSeconds is not a dead control on the relief
  //     side either)
  //   relief-draining-window2-safe                UNSAFE  24 / normal / restored / 0 / 0
  //   fully-relieved-safe                         OPTIMAL 10 / normal / restored / 0 / 0
  //   fully-relieved-via-throttling                OPTIMAL 12 / normal / restored / 0 / 0
  //
  // ── Why the two bounded-degrade states are ACCEPTABLE, not UNSAFE ──
  // Both have authSecurityStatus === "bounded-degraded" (the one and
  // only value this field ever takes when low-risk logins are using
  // the explicitly-allowed degraded flow while high-risk/privileged
  // logins remain genuinely protected) and
  // activeSessionsUnnecessarilyInvalidatedCount === 0 and
  // highRiskActionsAuthenticatedWithoutMfaCount === 0 — no security
  // violation has occurred, ever, in either state. This is the
  // scenario's required legitimate degraded-but-safe state
  // (phase6d3.md's explicit encouragement): existing valid-token
  // sessions continue, low-risk users get a real, policy-allowed
  // degraded flow, and high-risk/privileged users are protected (either
  // live-MFA-gated and therefore often blocked, or explicitly taken
  // offline) rather than exposed. This is NOT "almost fixed" — it is a
  // deliberate, bounded tradeoff a Principal engineer is expected to
  // choose and be willing to hand back, even though the MFA Provider
  // itself has not fully recovered and session-store pressure has not
  // fully drained.
  //
  // ── Why mfa-provider-recovered-pressure-unaddressed is UNSAFE despite
  // the provider showing fully "normal" ───────────────────────────────
  // sessionStorePressureLevel sits at 60 — above the acceptable
  // ceiling of 15 — because pressure relief is a genuinely separate
  // mechanism from MFA Provider recovery (two independently-caused
  // concurrent degradations per the incident's own framing). A
  // candidate who stops watching once the provider's own dashboard
  // turns green would wrongly conclude the system is safe; this state
  // exists specifically to catch that mistake.
  //
  // ── Why the bypass-all/allow-with-cached-risk family is UNSAFE
  // regardless of how healthy availability looks (phase6d3.md section
  // 22's binding security-QA requirement) ─────────────────────────────
  // authSecurityStatus === "compromised" fails successCondition's
  // explicit authSecurityStatus !== "compromised" check and
  // acceptableCondition's explicit authSecurityStatus === "bounded-
  // degraded" check — both directly, regardless of
  // lowRiskLoginSuccessRate/highRiskLoginSuccessRate reading 99.9. This
  // scenario can therefore never resolve as safe via this path, in any
  // tier, however long the candidate waits or however good the other
  // metrics look. If left active long enough
  // (highRiskActionsAuthenticatedWithoutMfaCount >= 40, sustained 45s —
  // reachable via mfa-bypass-all-compromised-sustained's 48 or
  // mfa-bypass-all-compromised-during-recovery's 62), the automatic
  // failureCondition fires — failure is never gated by completion
  // mode (tick.ts), so a candidate cannot simply decline to Finish and
  // wait out a live, worsening security violation.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "fail-closed but blunt" (UNSAFE — blocks low-risk
  // users needlessly) and "bounded-degraded" (ACCEPTABLE — a
  // deliberate, genuinely safe tradeoff) is a real system-state
  // distinction, but deciding WHETHER that bounded tradeoff is safe
  // enough to hand back — as opposed to continuing to wait for the
  // MFA Provider to fully recover and session-store pressure to fully
  // drain into the OPTIMAL state — is a genuine Principal-level
  // judgment call, not something the engine should auto-resolve the
  // instant a threshold is crossed. This mirrors Ledger Reconciliation
  // Divergence's and API Migration Dual-Write Failure's completion-mode
  // reasoning exactly.
  completion: { mode: "candidate_declared", acceptableCondition },
};
