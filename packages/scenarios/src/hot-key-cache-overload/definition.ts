import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { hotKeyCacheOverloadRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  KEY_REPLICATION_ENABLED_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
  LOCAL_API_CACHE_ENABLED_KEY,
  CACHE_TTL_SECONDS_KEY,
  CACHE_CLUSTER_SIZE_KEY,
  ORIGIN_PROTECTION_ENABLED_KEY,
  SHARDING_STRATEGY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const hotKeyCacheOverloadSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "hotShardStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The hot shard has entered a critical overload state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The hot shard has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "hotShardUtilizationPct",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Hot shard utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Hot shard utilization has dropped back below 90%.",
      },
    },
    {
      key: "hotShardLatencyMs",
      trackPeak: true,
    },
    {
      key: "originRequestRatePerSec",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: hotKeyCacheOverloadRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   hot-key-spike (baseline)              UNSAFE   util=95, critical,
  //                                          mitigationMode=unresolved
  //   cluster-scaled-no-relief (decoy)       UNSAFE   util=97, critical —
  //                                          broad cache-cluster scaling
  //                                          did nothing for the one hot
  //                                          shard, per this scenario's
  //                                          binding design requirement.
  //   origin-shielded                        UNSAFE   util=96, critical —
  //                                          origin request rate dropped
  //                                          to 90, but the hot shard
  //                                          itself (the real
  //                                          bottleneck) stayed fully
  //                                          saturated. Masking a
  //                                          downstream symptom is not
  //                                          a fix.
  //   ttl-extended-partial                   UNSAFE   util=82, warning —
  //                                          above the 40% bar, real but
  //                                          incomplete relief.
  //   ttl-shortened-worsened (harmful)       UNSAFE   util=99, critical.
  //   eviction-cascade (second wave,         UNSAFE   util=99, critical,
  //     no mitigation)                       origin rate=3400 — the
  //                                          observable delayed
  //                                          consequence of leaving the
  //                                          spike unmitigated.
  //   round-robin-spread                     ACCEPTABLE  util=28,
  //                                          normal, every symptom
  //                                          clear, but
  //                                          mitigationMode=
  //                                          "locality-sacrificed" — the
  //                                          fix spread load by
  //                                          abandoning per-key shard
  //                                          locality cluster-wide, not
  //                                          by fixing the hot key's own
  //                                          placement.
  //   replicated                             OPTIMAL  util=24, normal,
  //                                          mitigationMode="targeted".
  //   coalesced                              OPTIMAL  util=26, normal,
  //                                          mitigationMode="targeted".
  //   local-cached                           OPTIMAL  util=21, normal,
  //                                          mitigationMode="targeted".
  //
  // Three distinct rule states reach genuine, sustained-safe stability
  // via a fix specifically targeted at the hot key (replication,
  // coalescing, local API caching — all OPTIMAL and mutually
  // interchangeable as alternate strong paths), and one more reaches the
  // same symptom-free state by a visibly different, named-cost means
  // (round-robin sharding sacrifices per-key locality cluster-wide).
  // This is a legitimate candidate for an acceptableCondition tier per
  // section 9's standard — it is not "almost passed" or "partial
  // credit," it is a genuinely safe-to-hand-back state reached by a
  // real, different engineering tradeoff, the same shape as Missing
  // Database Index's feature-disabled tier and Hot Database Partition's
  // round-robin tier. The remaining states (origin-shielded, TTL
  // adjustments, broad cluster scaling, the eviction cascade) are real
  // but incomplete or actively harmful mitigations that never cross
  // either bar — correctly left ineligible for Finish rather than
  // awarded a third tier, per section 9's explicit "not almost passed,
  // not partial credit" rule.
  //
  // Decision: candidate_declared, with acceptableCondition covering the
  // round-robin tradeoff. "Is the hot shard's own number healthy" is not,
  // by itself, proof the system is safe to hand back — the candidate
  // must judge whether the fix was targeted at the hot key specifically
  // or whether it cleared the symptom by sacrificing a guarantee
  // (per-key shard locality) the rest of the system may depend on, which
  // is exactly the "is this safe enough to hand back" judgment
  // candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
