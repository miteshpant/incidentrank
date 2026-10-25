import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { hotShardReplicaLagFailoverRiskRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const hotShardReplicaLagFailoverRiskSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "shard2CorrectnessRiskStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Shard 2 write-authority correctness risk has entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Shard 2 write-authority correctness risk has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "shard2StrandedAcknowledgedWriteCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Acknowledged writes have been stranded by an unsafe Shard 2 failover.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "The stranded-write backlog has drained back to zero.",
      },
    },
    {
      key: "shard2ReplicaLagSeconds",
      trackPeak: true,
    },
    {
      key: "shard2PrimaryQueueDepth",
      trackPeak: true,
    },
    {
      key: "apiCustomerLatencyMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: hotShardReplicaLagFailoverRiskRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d.2.md section 10, binding) ────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (strandedWrites / failoverSafety /
  // replicaLagSeconds / primaryQueueDepth / correctnessRiskStatus):
  //
  //   healthy-default                      N/A (pre-incident)
  //   hot-shard-only                       UNSAFE   0 / safe / 0   / 260  / normal
  //   baseline-unmitigated                 UNSAFE   0 / safe / 80  / 540  / normal
  //   baseline-unmitigated-sustained        UNSAFE   0 / safe / 150 / 860  / normal
  //   broad-scaling-worsened               UNSAFE   0 / safe / 140 / 1150 / normal
  //   stale-read-routing-violation         UNSAFE   0 / safe / 95  / 640  / warning
  //   unsafe-failover-active (onset)        UNSAFE  85 / unsafe-promotion / 70 / 0 / critical
  //   unsafe-failover-active-sustained      UNSAFE 140 / unsafe-promotion / 95 / 0 / critical
  //   unsafe-failover-reconciling-early     UNSAFE  60 / unsafe-promotion / 20 / 15 / warning
  //   unsafe-failover-reconciling-drained   UNSAFE  12 / unsafe-promotion / 2  / 0  / warning
  //   throttled-without-catchup-priority   ACCEPTABLE 0 / safe / 18 / 0 / warning
  //   alternate-moderate-throttle-draining  ACCEPTABLE 0 / safe / 28 / 45 / warning
  //   alternate-moderate-throttle-recovered OPTIMAL    0 / safe / 5  / 0 / normal
  //   contained-draining                   ACCEPTABLE 0 / safe / 22 / 20 / warning
  //   contained-recovered                  OPTIMAL    0 / safe / 2  / 0 / normal
  //   safe-failover-after-threshold        OPTIMAL    0 / safe / 0  / 0 / normal
  //
  // Every state with shard2FailoverSafety === "unsafe-promotion" is
  // UNSAFE, full stop, regardless of how low the stranded-write count
  // has since drained to via reconciliation (even
  // unsafe-failover-reconciling-drained at 12, far below the failure
  // threshold of 130, is still UNSAFE) -- per phase6d.2.md section 9's
  // binding rule, "fixing the cause != undoing damage already
  // caused." The mistake of promoting under unsafe lag is permanent
  // for the attempt: reconciliation bounds and drains the
  // CONSEQUENCE, but it can never retroactively make the PROMOTION
  // itself safe, so shard2FailoverSafety never reverts to "safe" once
  // set to "unsafe-promotion" (see rules.ts -- no rule anywhere
  // re-sets this field back). This is also why scoring's dataIntegrity
  // measure bands on this string field directly rather than on the
  // raw (and legitimately time-varying) stranded-write count: a
  // candidate who caused the damage and then reconciled it well is
  // still meaningfully worse, on correctness, than a candidate who
  // never caused it -- SUCCESS/ACCEPTABLE conditions require the
  // mechanism itself to read "safe", not merely "stranded count
  // currently low."
  //
  // The genuinely non-correctness-violating states split into three
  // tiers:
  //
  //   UNSAFE (new damage still accumulating OR objectively broken):
  //     every baseline/no-mitigation state, the broad-API-scaling
  //     trap (queue depth/latency actively worse than doing nothing),
  //     and the stale-read-routing violation (a real, distinct
  //     business-invariant breach even though no write authority
  //     changed hands). None of these may ever satisfy
  //     success/acceptableCondition -- and they do not, because
  //     shard2PrimaryQueueDepth stays nonzero and
  //     shard2ReplicaLagSeconds stays far above both bounds for as
  //     long as the hot-tenant/API-scaling root cause remains
  //     unaddressed.
  //
  //   ACCEPTABLE (new damage stopped, correctness protected, backlog
  //   bounded and demonstrably draining, not yet fully recovered):
  //     "contained-draining" and "alternate-moderate-throttle-
  //     draining" -- hot-tenant pressure is genuinely contained
  //     (shard2PrimaryQueueDepth down from the baseline's 540+ to 20-
  //     45) and failoverSafety reads "safe" (no unsafe promotion ever
  //     happened), but shard2ReplicaLagSeconds (22-28s) has not yet
  //     crossed the real elapsed drain window. "throttled-without-
  //     catchup-priority" is the same tier reached via a different,
  //     slightly weaker lever combination (replica catch-up left at
  //     normal priority, so lag drains more slowly even after the
  //     drain window -- 18s, still within the acceptable bound but
  //     not the optimal one).
  //
  //   OPTIMAL (fully recovered, zero correctness risk, zero
  //   meaningful backlog): "contained-recovered" and "alternate-
  //   moderate-throttle-recovered" (two distinct, both-legitimate
  //   full-recovery strategies) and "safe-failover-after-threshold"
  //   (the primary path DOES use the failover lever, but only once
  //   the real drain window has elapsed AND hot-tenant pressure was
  //   strictly throttled first -- proving the control is not
  //   intrinsically forbidden, only unsafe when used before the
  //   replica has genuinely caught up).
  //
  // Because a genuine, bounded-but-not-fully-healthy acceptable tier
  // exists (phase6d.2.md section 9's explicit allowance: "a system may
  // be acceptable with bounded historical recovery still draining"),
  // and because deciding "is this draining-but-imperfect state safe
  // enough to hand back" is itself part of the Principal-level
  // judgment this scenario tests (not an objective, single-bar
  // condition), this scenario is `candidate_declared`, not
  // `automatic` -- mirroring Multi-Region Payment Platform
  // Degradation's completion-mode reasoning exactly.
  completion: { mode: "candidate_declared", acceptableCondition },
};
