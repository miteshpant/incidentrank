import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { loadBalancerImbalanceRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const loadBalancerImbalanceSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "balancerStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The load balancer fleet has entered a critical imbalance state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The load balancer fleet has recovered to an even distribution.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "instanceAConnectionCount",
      trackPeak: true,
      threshold: {
        value: 500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Instance A's connection count has crossed 500.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Instance A's connection count has dropped back below 500.",
      },
    },
    {
      key: "instanceALatencyMs",
      trackPeak: true,
    },
    {
      key: "globalSuccessRatePct",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: loadBalancerImbalanceRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6c.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   unmitigated-skew (baseline)                    UNSAFE  success=88%,
  //                                                    balancerStatus=critical
  //   compounded-skew (second wave, no fix)           UNSAFE  success=72%,
  //                                                    balancerStatus=critical
  //   capacity-added-skew-persists (harmful trap)      UNSAFE  success=89%,
  //                                                    balancerStatus=critical
  //   weights-adjusted-skew-persists (harmful trap)    UNSAFE  success=90%,
  //                                                    balancerStatus=critical
  //   sensitive-health-check-partial (partial)         UNSAFE  success=95%,
  //                                                    balancerStatus=warning,
  //                                                    instanceAConnectionCount
  //                                                    still 560 — existing
  //                                                    pinned clients still
  //                                                    hammering A.
  //   drained-acceptable (connection draining)         ACCEPTABLE  success=97%,
  //                                                    balancerStatus=warning,
  //                                                    instanceAConnectionCount
  //                                                    = 60 (back to normal
  //                                                    range), but
  //                                                    imbalanceRootCause =
  //                                                    "unresolved" — the
  //                                                    sticky-hash mechanism
  //                                                    itself is untouched,
  //                                                    only forcibly reset
  //                                                    once.
  //   rebalanced-by-strategy / rebalanced-by-no-stickiness  OPTIMAL
  //                                                    success=100%,
  //                                                    balancerStatus=normal,
  //                                                    imbalanceRootCause =
  //                                                    "rebalanced" — the
  //                                                    routing mechanism
  //                                                    itself was corrected.
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (fix the routing mechanism vs. force a one-time
  // reconnect), so this is a legitimate candidate for an
  // acceptableCondition tier per section 10's standard: connection
  // draining is a deliberate, bounded tradeoff (forced disconnects, no
  // durable guarantee against re-skewing) that genuinely leaves the
  // system safe to hand back right now — not "almost fixed" or "partial
  // credit." The remaining states (sensitive health check alone,
  // instance-count/traffic-weight traps) are real but incomplete
  // mitigations that never cross either bar — correctly left ineligible
  // for Finish, not awarded a third tier.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // connection-draining state. "Has global success rate happened to
  // recover" is not, by itself, proof the system is safe to hand back —
  // the candidate must judge whether recovery came from fixing the
  // routing mechanism or merely forcing a one-time reset of pinned
  // connections, which is exactly the "is this safe enough to hand back"
  // judgment candidate_declared exists to test.
  //
  // ── Immediate-Finish audit (phase6c.md section 9) ──────────────────
  // At t=0 (before sessionSurge fires), the system is already in its
  // authored healthy-default state, which trivially satisfies both
  // conditions' numeric/string thresholds (globalSuccessRatePct=100,
  // balancerStatus="normal", instanceAConnectionCount=50) — so BOTH
  // successCondition and acceptableCondition deliberately also require
  // the `sessionSurge` trigger to be true (source: "trigger"), which is
  // only ever set once the incident's own timeline actually fires at
  // 30s. Pre-incident health can never satisfy either condition no
  // matter how long a candidate waits before the incident starts, so
  // an immediate Finish at t=0 is correctly declared_unstable (the
  // engine has not even recorded incidentStartedAtMs yet). Once
  // sessionSurge fires, both conditions require 30 real seconds of
  // sustained acceptable-or-better state (sustainedSeconds: 30) —
  // chosen to exceed every rules.ts recovery state's natural settle
  // tick, so waiting alone (taking no action while the incident is
  // live) never accumulates a sustain window on its own, since the
  // unmitigated/compounded states never satisfy either condition's
  // globalSuccessRatePct/balancerStatus thresholds. See
  // load-balancer-imbalance.test.ts's dedicated immediate-zero-action-
  // Finish test, which asserts declared_unstable both at t=0 and
  // immediately after sessionSurge fires, and resolved/acceptable only
  // once a real mitigation has been applied AND sustained for 30s.
  completion: { mode: "candidate_declared", acceptableCondition },
};
