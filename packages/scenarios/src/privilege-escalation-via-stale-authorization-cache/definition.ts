import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { privilegeEscalationViaStaleAuthorizationCacheRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CACHE_INVALIDATION_MODE_KEY,
  CACHE_PURGE_SCOPE_KEY,
  CACHE_TTL_SECONDS_KEY,
  CONVERGENCE_UNCERTAINTY_MODE_KEY,
  CONVERGENCE_VERIFICATION_KEY,
  POLICY_STORE_READ_MODE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const privilegeEscalationViaStaleAuthorizationCacheSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "fleetCacheConvergenceStatus",
      // No announceCritical — fleetCacheConvergenceStatus's value set is
      // {converged, converging, unverified}, not the generic {normal,
      // warning, critical} severity vocabulary, so it is intentionally
      // NOT declared with an announceCritical narration.
      // (authorizationStatus is a plain string-state field, not a
      // severity field either, for the same reason — see metrics.ts.)
    },
  ],
  numericWatchFields: [
    {
      key: "cumulativeStalePrivilegeGrantCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "A stale cache instance has granted access on the already-revoked privilege at least once during this incident — a permanent historical consequence that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further stale privilege grants are currently being served.",
      },
    },
    {
      key: "cacheConvergencePercent",
      trackPeak: false,
    },
    {
      key: "correctDenyRatePercent",
      trackPeak: false,
    },
    {
      key: "staleGrantRatePercent",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "The already-revoked privilege is currently being actively granted by a stale cache.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Stale privilege grants have stopped.",
      },
    },
  ],
  timedEvents,
  rules: privilegeEscalationViaStaleAuthorizationCacheRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase-6e-strategy-spec.md section 16,
  // same style/rigor as distributed-coordination-failure/definition.ts,
  // identity-platform-degradation/definition.ts, and
  // authorization-policy-rollout-failure/definition.ts) ───────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (staleGrantRate% / cacheConvergence% /
  // fleetCacheConvergenceStatus / cumulativeStalePrivilegeGrantCount /
  // enforcementPosture / authorizationStatus):
  //
  //   healthy-default                            N/A (pre-incident)
  //   fail-closed-baseline                       UNSAFE  0/55/converging/0/fail-closed/revoked-not-converged
  //   fail-closed-baseline-sustained             UNSAFE  0/40/converging/0/fail-closed/revoked-not-converged
  //     (the only reachable sustained-no-action state — every control's
  //     initial value already matches this rule's bare trigger
  //     constraint, so a true zero-action attempt reaches this rule,
  //     not a separate hidden state)
  //   broad-trust-all-reintroduces-staleness     UNSAFE  0/20/converging/0/fail-closed/revoked-not-converged
  //     (re-admission trap: WORSE convergence than the plain baseline
  //     above at an equivalent elapsed time — 20 vs 55/40 — proving
  //     broad-trust-all is a trap even without fail-open)
  //   assumed-converged-unverified               UNSAFE  0/85/unverified/0/fail-closed/revoked-not-converged
  //     (sequencing trap: no live violation has occurred, but
  //     convergence has never been verified — genuinely below 100% and
  //     explicitly flagged "unverified," not "converging")
  //   converging-window1                         UNSAFE  0/68/converging/0/fail-closed/revoked-not-converged
  //   converging-window2                         UNSAFE  0/85/converging/0/fail-closed/revoked-not-converged
  //   passive-converging-short-ttl                UNSAFE  0/70/converging/0/fail-closed/revoked-not-converged
  //   passive-converged-long-ttl                  UNSAFE  0/97/converging/0/fail-closed/revoked-not-converged
  //     (97% != 100%, and convergenceVerification was never engaged —
  //     genuinely not there yet on either axis)
  //   fail-open-stale-grant                       UNSAFE  10/55/unverified/180/fail-open/stale-grant-active
  //   fail-open-stale-grant-sustained              UNSAFE  15/40/unverified/640/fail-open/stale-grant-active
  //   fail-open-stale-grant-during-convergence     UNSAFE  3/70/unverified/240/fail-open/stale-grant-active
  //     (best-looking availability numbers in the ENTIRE scenario —
  //     requestSuccessRate at 99.9 identical to OPTIMAL — yet the
  //     single worst dataIntegrity/reliability outcome; see the
  //     security-QA audit below)
  //   broad-trust-all-fail-open-compounded        UNSAFE  13/45/unverified/310/fail-open/stale-grant-active
  //     (the single worst combination: re-admission trap PLUS fail-open)
  //   safe-degraded-source-of-truth-required      ACCEPTABLE 0/55/converging/0/fail-closed/safe-degraded
  //   converged-safe                              OPTIMAL 0/100/converged/0 (live)/fail-closed/converged-safe
  //
  // Every UNSAFE state fails successCondition for a real, named
  // reason: either cacheConvergencePercent < 100 or
  // fleetCacheConvergenceStatus != "converged" (convergence genuinely
  // incomplete OR never verified — including the 97%-long-TTL case,
  // which is close but not equal, and the 85%-unverified case, which
  // has no live violation but also no proof of safety), or
  // staleGrantRatePercent > 0 (an actively-happening security
  // violation — never acceptable regardless of how healthy
  // availability looks, per section 11's binding security-QA
  // requirement). None of these is "almost fixed by coincidence of
  // rounding" — each fails a real, named gate.
  //
  // ACCEPTABLE (safe-degraded-source-of-truth-required) is the ONE
  // genuine bounded tradeoff: staleGrantRatePercent is exactly 0 (every
  // decision is double-checked directly against the Policy Store, so
  // correctness is never in doubt by construction), a real, deliberate
  // availability cost is accepted (requestSuccessRate 96.5 vs the
  // fail-closed baseline's 99.2), and fleet convergence is still
  // incomplete — this is deliberately a judgment call ("is paying this
  // latency cost worth guaranteed correctness while convergence
  // finishes, or should I wait for full convergence instead"), not an
  // objective zero/nonzero gate.
  //
  // OPTIMAL requires cacheConvergencePercent === 100 AND
  // fleetCacheConvergenceStatus === "converged" AND
  // staleGrantRatePercent === 0 AND enforcementPosture === "fail-closed"
  // — reachable via EITHER alternate strong path (immediate/forced
  // invalidation, or a targeted purge), both gated on
  // convergenceVerification = "verify-before-trust" having been
  // engaged, proving both are genuinely, independently viable AND that
  // verification (not merely elapsed time) is the real gate.
  //
  // ── Why fail-open is UNSAFE regardless of how healthy availability
  // looks (section 11's binding security-QA requirement) ──────────────
  // authorizationStatus === "stale-grant-active" fails successCondition's
  // explicit staleGrantRatePercent === 0 check and acceptableCondition's
  // explicit authorizationStatus === "safe-degraded" check — both
  // directly, regardless of requestSuccessRate reading 99.9 (identical
  // to the OPTIMAL ceiling). This scenario can therefore never resolve
  // as safe via this path, in any tier, however long the candidate
  // waits or however good the other metrics look. If left active long
  // enough (cumulativeStalePrivilegeGrantCount >= 700, sustained 30s —
  // reachable via fail-open-stale-grant-sustained's 640 plus continued
  // accrual), the automatic failureCondition fires — failure is never
  // gated by completion mode (tick.ts), so a candidate cannot simply
  // decline to Finish and wait out a live, worsening security
  // violation.
  //
  // ── Why assumed-converged-unverified is UNSAFE despite zero live
  // violations ───────────────────────────────────────────────────────
  // No stale grant has ever happened in this state (staleGrantRatePercent
  // is exactly 0, cumulativeStalePrivilegeGrantCount is exactly 0) — but
  // cacheConvergencePercent sits at 85, genuinely below the 100 the
  // OPTIMAL tier requires, and fleetCacheConvergenceStatus explicitly
  // reads "unverified" rather than "converged." A candidate who
  // concludes "enough time has passed, it's probably fine" without
  // ever engaging convergenceVerification is trusting an assumption,
  // not a verified fact — this state exists specifically to catch that
  // mistake, mirroring Authorization Policy Rollout Failure's
  // premature-declare trap.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // converged-safe's live `values.cumulativeStalePrivilegeGrantCount`
  // authors 0 (the live field answers "is a stale grant happening RIGHT
  // NOW"), but if this attempt ever passed through the fail-open
  // family, state.peaks.peakValues.cumulativeStalePrivilegeGrantCount
  // (a numericWatchField with trackPeak:true, computed generically by
  // the engine as Math.max every tick regardless of which rule
  // currently matches) remains permanently nonzero for the rest of the
  // attempt — it is never reset by reaching a clean rule state. This is
  // the same non-self-resetting mechanism Identity Platform Degradation
  // and Authorization Policy Rollout Failure use for their own
  // historical counters: whether unsafe access happened EARLIER in this
  // attempt is a permanent scar visible via peak tracking (and
  // penalized by scoring's dataIntegrity dimension), never a second
  // completion gate re-litigating the past on top of the live
  // successCondition.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "fail-closed but still converging" (UNSAFE —
  // convergence genuinely incomplete) and "source-of-truth-required"
  // (ACCEPTABLE — a deliberate, genuinely safe tradeoff) is a real
  // system-state distinction, but deciding WHETHER that bounded
  // tradeoff is worth its latency cost — as opposed to continuing to
  // wait for full fleet convergence and reaching the OPTIMAL state — is
  // a genuine Principal-level judgment call, not something the engine
  // should auto-resolve the instant a threshold is crossed. This
  // mirrors Identity Platform Degradation's and Authorization Policy
  // Rollout Failure's completion-mode reasoning exactly.
  completion: { mode: "candidate_declared", acceptableCondition },
};
