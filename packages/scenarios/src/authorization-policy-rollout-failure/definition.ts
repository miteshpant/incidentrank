import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { authorizationPolicyRolloutFailureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHE_INVALIDATION_KEY,
  EMERGENCY_OVERRIDE_LIST_KEY,
  FAIL_OPEN_MODE_KEY,
  POLICY_CACHE_TTL_SECONDS_KEY,
  POLICY_VERSION_PIN_KEY,
  ROLLBACK_SOURCE_POLICY_KEY,
  ROLLOUT_FREEZE_KEY,
  STAGED_COHORT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const authorizationPolicyRolloutFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "fleetVersionSkewStatus",
      // No announceCritical — fleetVersionSkewStatus's value set is
      // {converged, skewed, unbounded}, not the generic {normal,
      // warning, critical} severity vocabulary, so it is intentionally
      // NOT declared as a severity field. (authorizationStatus is a
      // plain string-state field, not a severity field either, for the
      // same reason — see metrics.ts.)
    },
  ],
  numericWatchFields: [
    {
      key: "cumulativeUnauthorizedAccessCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "Unauthorized access has been granted at least once during this incident — a permanent historical consequence that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further unauthorized access is currently being granted.",
      },
    },
    {
      key: "cacheConvergencePercent",
      trackPeak: false,
    },
    {
      key: "falseDenyRatePercent",
      trackPeak: true,
    },
    {
      key: "unauthorizedGrantRatePercent",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Unauthorized access is currently being actively granted.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Unauthorized access grants have stopped.",
      },
    },
  ],
  timedEvents,
  rules: authorizationPolicyRolloutFailureRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d3.md section 10, same style/rigor
  // as distributed-coordination-failure/definition.ts and
  // ledger-reconciliation-divergence/definition.ts) ───────────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (falseDenyRate% / unauthorizedGrantRate% /
  // cacheConvergence% / fleetVersionSkewStatus / cumulativeUnauthorized
  // AccessCount / enforcementPosture / authorizationStatus):
  //
  //   healthy-default                         N/A (pre-incident)
  //   baseline                                UNSAFE  4.5/0/70/skewed/0/fail-closed-all/regressed
  //   widening-unfrozen                       UNSAFE  9.5/0/15/unbounded/0/fail-closed-all/regressed (the
  //                                                    only reachable sustained-no-action state —
  //                                                    rolloutFreeze's initial value is "rolling", so
  //                                                    a true zero-action attempt reaches this rule,
  //                                                    not a separate "baseline-sustained" state)
  //   frozen-source-unfixed                   UNSAFE  5.8/0/70/skewed/0/fail-closed-all/regressed
  //   emergency-deny-high-risk                UNSAFE  7.0/0/70/skewed/0/fail-closed-all/regressed
  //   source-fixed-unconverged                UNSAFE  3.2/0/25/skewed/0/fail-closed-all/fixed-converging (premature-declare trap)
  //   source-rolled-back-unconverged          UNSAFE  3.2/0/25/skewed/0/fail-closed-all/fixed-converging (premature-declare trap)
  //   converging-window1                      UNSAFE  1.8/0/62/skewed/0/fail-closed-all/fixed-converging
  //   converging-window2                      UNSAFE  0.9/0/85/skewed/0/fail-closed-all/fixed-converging
  //   passive-converging-short-ttl            UNSAFE  1.6/0/58/skewed/0/fail-closed-all/fixed-converging
  //   passive-converged-long-ttl              UNSAFE  0.2/0/97/skewed/0/fail-closed-all/fixed-converging (97% != 100%, genuinely not there yet)
  //   staged-reexpansion                      UNSAFE  1.0/0/62/skewed/0/fail-closed-all/fixed-converging
  //   fail-open-all                           UNSAFE  0/11/60/skewed/240/fail-open-all/unauthorized-access-active
  //   fail-open-all-sustained                 UNSAFE  0/14/40/unbounded/820/fail-open-all/unauthorized-access-active
  //   emergency-allow-override                UNSAFE  1/4/60/skewed/95/fail-closed-all/unauthorized-access-active
  //   emergency-allow-override-sustained      UNSAFE  1/5/40/unbounded/310/fail-closed-all/unauthorized-access-active
  //   safe-degraded-noncritical                ACCEPTABLE 0.8/0/55/skewed/0/fail-open-noncritical/safe-degraded
  //   converged-safe                           OPTIMAL 0.1/0/100/converged/0 (live)/fail-closed-all/converged-safe
  //
  // Every UNSAFE state fails successCondition for a real, named reason:
  // either cacheConvergencePercent < 100 (convergence genuinely
  // incomplete — including the 97%-long-TTL case, which is close but
  // not equal), or unauthorizedGrantRatePercent > 0 (active unauthorized
  // access — never acceptable regardless of how healthy availability
  // looks, per phase6d3.md's binding security-QA requirement), or
  // enforcementPosture != "fail-closed-all" while still mid-incident.
  // None of these is "almost fixed by coincidence of rounding" — each
  // fails a real, named gate (incomplete convergence, active
  // unauthorized access, or an un-restored enforcement posture).
  //
  // ACCEPTABLE (safe-degraded-noncritical) is the ONE genuine bounded
  // tradeoff: unauthorizedGrantRatePercent is exactly 0 (protected
  // resources remain fail-closed the entire time), a real, bounded
  // false-deny rate is accepted, and convergence is still incomplete —
  // this is deliberately a judgment call ("is this bounded degradation
  // safe enough to hand back while convergence finishes"), not an
  // objective zero/nonzero gate, which is exactly why this scenario
  // needs a real acceptable tier rather than treating "not yet 100%" as
  // automatically unsafe.
  //
  // OPTIMAL requires cacheConvergencePercent === 100 AND
  // fleetVersionSkewStatus === "converged" AND
  // unauthorizedGrantRatePercent === 0 AND enforcementPosture ===
  // "fail-closed-all" — reachable via EITHER alternate strong path
  // (policyVersionPin or rollbackSourcePolicy), proving both are
  // genuinely, independently viable.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // converged-safe's live `values.cumulativeUnauthorizedAccessCount`
  // authors 0 (the live field answers "is unauthorized access
  // happening RIGHT NOW"), but if this attempt ever passed through
  // fail-open-all or the allow-affected-cohort override,
  // state.peaks.peakValues.cumulativeUnauthorizedAccessCount (a
  // numericWatchField with trackPeak:true, computed generically by the
  // engine as Math.max every tick regardless of which rule currently
  // matches) remains permanently nonzero for the rest of the attempt —
  // it is never reset by reaching a clean rule state. This is the same
  // non-self-resetting mechanism Ledger Reconciliation Divergence and
  // Distributed Coordination Failure use for their own historical
  // counters, generalized rather than reinvented: whether unsafe access
  // happened EARLIER in this attempt is a permanent scar visible via
  // peak tracking (and penalized by scoring's dataIntegrity dimension
  // at the moment fail-open-all was actually active — see scoring.ts),
  // never a second completion gate re-litigating the past on top of
  // the live successCondition.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between a genuinely-fixed-but-still-converging state
  // (UNSAFE — convergence incomplete) and the deliberate bounded
  // tradeoff of fail-open-noncritical (ACCEPTABLE) is a real system-
  // state distinction, but deciding WHETHER a given amount of bounded,
  // non-critical false-deny exposure is "safe enough to hand back" —
  // versus continuing to wait out full convergence for the OPTIMAL
  // state — is a genuine Principal-level judgment call, not a
  // threshold the engine should auto-resolve the instant it's crossed.
  // This mirrors Ledger Reconciliation Divergence's and API Migration
  // Dual-Write Failure's identical reasoning: an acceptable tier that
  // is correctness-safe but intentionally imperfect is best modeled as
  // a declared handback.
  completion: {
    mode: "candidate_declared",
    acceptableCondition,
  },
};
