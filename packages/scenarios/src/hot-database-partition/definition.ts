import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { hotDatabasePartitionRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  PARTITIONING_STRATEGY_KEY,
  TENANT_THROTTLE_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  ROUTING_POLICY_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  API_INSTANCE_COUNT_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const hotDatabasePartitionSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "partitionAStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Partition A has entered a critical overload state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Partition A has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "partitionAQueueDepth",
      trackPeak: true,
      threshold: {
        value: 500,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Partition A's queue depth has crossed 500 requests.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Partition A's queue depth has dropped back below 500 requests.",
      },
    },
    {
      key: "partitionARequestRate",
      trackPeak: true,
    },
    {
      key: "partitionBLatencyMs",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: hotDatabasePartitionRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   tenant-concentration (baseline)             UNSAFE   A critical,
  //                                                queue=620,
  //                                                rebalanceMode=unresolved
  //   partition-a-saturated (second wave)          UNSAFE   A critical,
  //                                                queue=1400
  //   scaled-contention (API scaled, harmful)      UNSAFE   A critical,
  //                                                queue=980, B/C/D idle
  //   cache-warming (partial)                      UNSAFE   A warning,
  //                                                queue=180
  //   moderate-throttle-partial (partial)           UNSAFE   A warning,
  //                                                queue=260
  //   shard-split-pressure-transferred              UNSAFE   A normal,
  //                                                but B degraded
  //                                                (latency=410,
  //                                                queue=260) — a
  //                                                different subsystem
  //                                                is now unsafe, so
  //                                                the SYSTEM as a whole
  //                                                is not safe to hand
  //                                                back even though
  //                                                Partition A looks
  //                                                fine.
  //   round-robin-balanced                          ACCEPTABLE  A
  //                                                normal, B/C/D
  //                                                normal, but
  //                                                rebalanceMode=
  //                                                round-robin — every
  //                                                partition is
  //                                                healthy, at the cost
  //                                                of per-tenant key
  //                                                locality.
  //   hot-tenant-throttled                          ACCEPTABLE  A
  //                                                normal, platform-wide
  //                                                healthy, but
  //                                                rebalanceMode=
  //                                                hot-tenant-
  //                                                constrained and
  //                                                throttledRequestRate
  //                                                PerSec=260 — the
  //                                                platform is fully
  //                                                protected, at the
  //                                                direct, visible cost
  //                                                of the hot tenants'
  //                                                own throughput. This
  //                                                is the scenario's
  //                                                required "protect
  //                                                everyone equally vs.
  //                                                constrain one
  //                                                tenant" tradeoff.
  //   rebalanced (salted-hash re-key)                OPTIMAL  every
  //                                                partition normal,
  //                                                every tenant treated
  //                                                equitably, no
  //                                                ongoing visible cost.
  //   shard-split-balanced (split + leastLoaded)     OPTIMAL  every
  //                                                partition normal;
  //                                                the migration cost
  //                                                that would otherwise
  //                                                land on Partition B
  //                                                is absorbed by
  //                                                failover routing
  //                                                instead of being
  //                                                left as a standing
  //                                                cost.
  //
  // Three states reach genuine, sustained-safe stability through
  // visibly different means (an equitable structural fix vs. two named,
  // accepted costs), so this is a legitimate candidate for an
  // acceptableCondition tier per section 9's standard ("bounded tenant
  // throttling protecting platform stability" is this standard's own
  // listed example). The remaining unsafe states are real but
  // incomplete mitigations, or — in shard-split-pressure-transferred's
  // case — a mitigation that relieved the primary symptom while
  // creating a new, equally real one elsewhere; none of them cross
  // either bar, and none are awarded a third tier, per section 9's
  // explicit "not almost passed, not partial credit" rule.
  //
  // Decision: candidate_declared, with acceptableCondition covering
  // both named tradeoffs (round-robin and hot-tenant-constrained) via
  // revenue-and-cost.ts's shared partitionBLatencyMs/queue gate plus the
  // rebalanceMode exclusion list. "Is Partition A's own number healthy"
  // is not, by itself, proof the system is safe to hand back — the
  // candidate must judge whether the fix was bought by moving the cost
  // onto a specific tenant, onto a specific guarantee, or onto a
  // specific other partition, which is exactly the "is this safe enough
  // to hand back" judgment candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
