import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { primaryDatabaseFailoverRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  FAILOVER_INITIATED_KEY,
  PROMOTION_TIMING_KEY,
  OLD_PRIMARY_FENCING_KEY,
  CONNECTION_DRAIN_KEY,
  WRITE_ROUTING_POLICY_KEY,
  REPLICA_COUNT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const primaryDatabaseFailoverSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "primaryStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The primary database has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The primary database path has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "replicationLagMs",
      trackPeak: true,
      threshold: {
        value: 5_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Replication lag has crossed 5 seconds.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Replication lag has dropped back below 5 seconds.",
      },
    },
    {
      key: "writeSuccessRatePct",
      trackPeak: false,
    },
    {
      key: "staleWriteCount",
      trackPeak: true,
    },
    {
      key: "lostWriteCount",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: primaryDatabaseFailoverRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   healthy (pre-incident)                        n/a (not reachable
  //                                                  while incident active)
  //   primary-degrading (no action)                 UNSAFE   write
  //                                                  success 78%, below
  //                                                  the 99% availability
  //                                                  bar.
  //   primary-unavailable-unmitigated (no failover)  UNSAFE   write
  //                                                  success 2%; also
  //                                                  trips automatic
  //                                                  failure if sustained.
  //   failover-initiated-incomplete (no fencing,
  //     routing still on old primary)                UNSAFE   write
  //                                                  success 40%.
  //   routing-not-cutover (fenced but routing
  //     never cut over)                               UNSAFE   write
  //                                                  success 5% — a loud,
  //                                                  visible failure, not
  //                                                  a silent one.
  //   split-primary-active (immediate promotion,
  //     unfenced old primary, routing cut over)       UNSAFE — THE TRAP.
  //                                                  writeSuccessRatePct
  //                                                  = 100, readSuccessRatePct
  //                                                  = 100, primaryStatus
  //                                                  = "warning" (not
  //                                                  critical) — looks
  //                                                  fully recovered at
  //                                                  the availability
  //                                                  layer. splitPrimaryActive
  //                                                  = true and
  //                                                  staleWriteCount = 180
  //                                                  (ongoing, unbounded)
  //                                                  correctly fail BOTH
  //                                                  successCondition and
  //                                                  acceptableCondition
  //                                                  via the explicit
  //                                                  staleWriteCount <= 0
  //                                                  bar — neither
  //                                                  availability metric
  //                                                  alone can satisfy
  //                                                  either condition.
  //   promoted-immediate-fenced-bounded-loss /
  //   promoted-immediate-fenced-undrained-loss        ACCEPTABLE   fully
  //                                                  healthy availability,
  //                                                  zero stale writes
  //                                                  (fenced immediately —
  //                                                  no ongoing hazard),
  //                                                  but a fixed, bounded,
  //                                                  non-growing
  //                                                  lostWriteCount (40 or
  //                                                  95) from promoting
  //                                                  before replication
  //                                                  lag had drained. A
  //                                                  genuine, accounted-
  //                                                  for safe-handback
  //                                                  tradeoff per section
  //                                                  9 — not a disguised
  //                                                  unsafe state.
  //   promoted-lag-drained-fenced                     OPTIMAL   fully
  //                                                  healthy availability,
  //                                                  zero stale writes,
  //                                                  zero lost writes —
  //                                                  the durable, fully
  //                                                  correct fix.
  //
  // Two states reach genuinely different, both-safe outcomes (wait for
  // lag to drain vs. fence immediately and accept a small bounded loss),
  // so this is a legitimate candidate for an acceptableCondition tier.
  // The central trap (split-primary-active) is reachable, looks healthy
  // at the availability layer, and is deliberately excluded from both
  // tiers by its ongoing staleWriteCount/splitPrimaryActive violation —
  // this is the scenario's entire reason for existing, per phase6b.md
  // section 10's binding "do not allow availability healthy, latency
  // healthy -> resolved when the system is accepting concurrent
  // leaders" requirement.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // bounded-loss tier. "Do write/read success read 100%" is not, by
  // itself, proof the system is safe to hand back — the candidate must
  // judge whether the old primary can still accept writes, which is
  // exactly the "is this safe enough to hand back" judgment
  // candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
