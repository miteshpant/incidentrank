import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { runawayCloudSpendDuringHealthyTrafficRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AUTOSCALER_TARGET_UTILIZATION_KEY,
  IDLE_CAPACITY_POLICY_KEY,
  MIN_REPLICA_COUNT_KEY,
  REQUEST_BATCHING_MODE_KEY,
  WARM_POOL_SIZE_KEY,
  WORKER_INSTANCE_CLASS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const runawayCloudSpendDuringHealthyTrafficSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  // No severity field is declared at all — no component in this
  // architecture ever enters "degraded" or "critical" componentHealth
  // in any rule (every rule maps to healthyHealth), so there is
  // nothing to announce as entering/recovering from critical. This is
  // a deliberate, authored absence, not an oversight: the scenario has
  // no outage dimension to narrate.
  severityFields: [],
  numericWatchFields: [
    {
      key: "cumulativeHeadroomBreachSeconds",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "The redundancy floor has been breached — a historical-consequence marker, not a live outage signal.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage:
          "The redundancy floor is no longer being actively breached (the peak historical exposure, however, never decreases).",
      },
    },
    {
      key: "costPerMinuteUsd",
      trackPeak: true,
    },
    {
      key: "runningInstanceCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: runawayCloudSpendDuringHealthyTrafficRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6e2.md requirement 12) ─────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (redundancyHeadroomStatus / costSafetyStatus /
  // cumulativeHeadroomBreachSeconds / runningInstanceCount /
  // costPerMinuteUsd):
  //
  //   cost-anomaly-baseline              UNSAFE (not yet handled)
  //     oversized / unaddressed / 0 / 48 / $2.60
  //   cost-anomaly-sustained             UNSAFE (not yet handled)
  //     oversized / unaddressed / 0 / 48 / $2.60
  //   aggressive-utilization-without-rightsizing UNSAFE (trap, not handled)
  //     oversized / unaddressed / 0 / 40 / $2.40
  //   warm-pool-removed-before-rightsizing UNSAFE (trap, not handled)
  //     oversized / unaddressed / 0 / 48 / $2.38 (negligible saving,
  //     real cold-start cushion removed for no benefit)
  //   economy-class-without-batching     UNSAFE (trap, not handled)
  //     oversized / unaddressed / 0 / 48 / $2.10 (real latency cost)
  //   floor-lowered-alone-partial        UNSAFE (real but incomplete)
  //     protected / unaddressed / 0 / 40 / $2.20
  //   min-replica-floor-breached(-sustained)     UNSAFE (floor breach)
  //     breached / minimum-cost-unsafe / 60-240 / 4 / $0.50
  //   idle-policy-floor-breached(-sustained)     UNSAFE (floor breach)
  //     breached / minimum-cost-unsafe / 60-240 / 4 / $0.55
  //   floor-breached-compounded(-sustained)      UNSAFE (worst floor breach)
  //     breached / minimum-cost-unsafe / 60-240 / 2 / $0.35
  //     (cheapest raw cost number in the ENTIRE scenario — proves the
  //     unsafe-minimum-cost path must never win on cost alone)
  //   path-a-rightsizing-just-engaged     UNSAFE (recovery-lag, tick 0)
  //     protected / rightsizing / 0 / 40 / $2.20
  //   path-a-rightsizing-draining-window1  UNSAFE (recovery-lag)
  //     protected / rightsizing / 0 / 24 / $1.40
  //   path-a-rightsizing-draining-window2  ACCEPTABLE (in-progress, safe)
  //     protected / rightsizing / 0 / 12 / $0.85
  //   batching-engaged-utilization-rising  ACCEPTABLE (in-progress, safe)
  //     oversized / rightsizing / 0 / 40 / $2.20
  //     NOTE: redundancyHeadroomStatus is still "oversized" (floor
  //     untouched) here — acceptableCondition requires "protected", so
  //     this state is NOT actually Finish-eligible; see the
  //     "oversized-but-rightsizing is correctly ineligible" note below.
  //   path-a-optimal-fully-drained          OPTIMAL
  //     protected / efficient-safe / 0 / 7 / $0.60
  //   path-b-optimal-batched-and-drained    OPTIMAL (different mechanism)
  //     protected / efficient-safe / 0 / 7 / $0.62
  //
  // ── Why "oversized-but-rightsizing" (batching-engaged-utilization-
  // rising) is correctly NOT Finish-eligible ───────────────────────────
  // acceptableCondition requires redundancyHeadroomStatus === "protected"
  // — batching alone raises utilization but never touches
  // minReplicaCount, so the floor itself is still the leftover 40 (a
  // real, if currently-safe, oversized posture, not yet a deliberately-
  // sized "protected" floor). This correctly keeps a candidate who only
  // engaged batching from declaring an incomplete rightsizing effort
  // "acceptable" — Path B's final step (lowering minReplicaCount to 6,
  // the safe floor) is still required before any Finish is eligible, at
  // either tier.
  //
  // ── Why the unsafe-minimum-cost family is UNSAFE regardless of how
  // low cost looks (phase6e2.md requirement 4's binding rule) ──────────
  // redundancyHeadroomStatus === "breached" fails successCondition's
  // explicit "protected" check and acceptableCondition's identical
  // check, directly, regardless of costPerMinuteUsd/runningInstanceCount
  // reading their lowest values anywhere in the scenario. This path can
  // therefore never resolve as safe, in any tier, however long the
  // candidate waits. If left active long enough
  // (cumulativeHeadroomBreachSeconds >= 200, sustained 45s — reachable
  // via either *-sustained rule's 240), the automatic failureCondition
  // fires — failure is never gated by completion mode (tick.ts), so a
  // candidate cannot simply decline to Finish and wait out a live,
  // worsening redundancy breach while enjoying its cost numbers.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "a real, if incomplete, rightsizing effort already
  // underway" (ACCEPTABLE) and "fully drained to the genuinely optimal
  // target" (OPTIMAL) is a real system-state distinction, but deciding
  // WHETHER a recovery-lag-bound in-progress state is safe enough to
  // hand back — as opposed to waiting the remaining drain time for the
  // fully optimal target — is a genuine Principal/Senior-Staff judgment
  // call about cost AND risk, not something the engine should
  // auto-resolve the instant a threshold is crossed. This mirrors
  // Identity Platform Degradation's and Replication Backlog's
  // completion-mode reasoning exactly, and is additionally required
  // here per phase6e2.md requirement 10/12: safe handback genuinely
  // requires candidate judgment about whether "everything already
  // looks green" reflects a genuinely-sized fleet or merely a
  // currently-healthy-but-still-oversized one.
  //
  // Immediate-Finish audit (phase6e2.md requirement 10): at t=0 the
  // incident has not started (incidentStartedAtMs is null until
  // COST_ANOMALY_DETECTED_MS), so the engine's own sustain-window
  // bookkeeping never accrues consecutiveSuccessSeconds/
  // consecutiveAcceptableSeconds before the incident begins —
  // evaluateCompletionEligibility returns { eligible: false } for an
  // immediate zero-action Finish, and evaluateCandidateDeclaredFinish
  // returns outcome "declared_unstable". Once the incident starts, the
  // baseline state (cost-anomaly-baseline) immediately fails both
  // successCondition (costSafetyStatus is "unaddressed", not
  // "efficient-safe") and acceptableCondition (costSafetyStatus is
  // "unaddressed", not "rightsizing") on the very first gated field, so
  // there is no window in which a zero-action Finish on an
  // already-healthy-looking system is ever mistaken for having actually
  // solved the cost problem — see the test suite's explicit zero-action
  // Finish assertion.
  completion: { mode: "candidate_declared", acceptableCondition },
};
