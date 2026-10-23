import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { storageIopsSaturationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BACKGROUND_WORKLOAD_PAUSED_KEY,
  BATCH_CONCURRENCY_KEY,
  CHECKPOINT_FREQUENCY_SECONDS_KEY,
  STORAGE_TIER_KEY,
  QUERY_CONCURRENCY_LIMIT_KEY,
  READ_CACHE_ENABLED_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const storageIopsSaturationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "storageStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "Persistent storage has entered a critical IOPS saturation state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "Persistent storage has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "storageIopsUtilization",
      trackPeak: true,
      threshold: {
        value: 90,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Storage IOPS utilization has crossed 90%.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Storage IOPS utilization has dropped back below 90%.",
      },
    },
    {
      key: "checkpointQueueDepth",
      trackPeak: true,
    },
    {
      key: "batchBacklogMinutes",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: storageIopsSaturationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6b.md section 8) ──────────────────
  //
  // Reachable terminal/stable rule states, classified:
  //
  //   iops-rising (baseline)                   UNSAFE   iops=88, critical
  //   iops-saturated (second wave, no fix)      UNSAFE   iops=97, critical
  //   query-throttled-api-degraded (harmful)    UNSAFE   iops=86, critical,
  //                                              apiLatencyMs=1900 — worse
  //                                              than doing nothing
  //   checkpoint-extended (partial)             UNSAFE   iops=74, warning
  //   read-cache-warming (partial)              UNSAFE   iops=80, warning
  //   reduced-concurrency (partial)             UNSAFE   iops=58, warning
  //                                              — real relief, still
  //                                              above the 40% recovery
  //                                              bar
  //   paused-backlog-* (workload paused)        ACCEPTABLE  iops=24,
  //                                              normal, but
  //                                              storageRecoveryMode =
  //                                              "workload-paused" and
  //                                              batchBacklogMinutes is
  //                                              climbing — the batch
  //                                              job's own progress was
  //                                              suppressed, not storage
  //                                              capacity fixed.
  //   tier-upgraded (storage tier upgraded)      OPTIMAL  iops=35, normal,
  //                                              storageRecoveryMode =
  //                                              "tier-upgraded" — the
  //                                              real capacity fix, batch
  //                                              job keeps running at
  //                                              full throughput with no
  //                                              backlog.
  //
  // Two states reach genuine, sustained-safe stability through visibly
  // different means (fixing storage's IOPS ceiling vs. suppressing the
  // workload that was drawing on it), so this is a legitimate candidate
  // for an acceptableCondition tier per section 9's explicit example
  // list ("optional enrichment disabled while core customer path is
  // healthy" generalizes directly to "a non-critical background job
  // paused while the rest of the platform is healthy"). The growing
  // batchBacklogMinutes alongside the acceptable tier is the known,
  // bounded cost of that tradeoff, not evidence of an unsafe handback —
  // exactly the kind of deliberate, disclosed tradeoff section 9
  // describes, not "almost passed" or "partial credit." The remaining
  // states (reduced concurrency, extended checkpoint interval, read
  // cache, query throttling) are real but incomplete mitigations that
  // never cross either bar — correctly left ineligible for Finish
  // rather than awarded a third tier.
  //
  // Decision: candidate_declared, with acceptableCondition set to the
  // workload-paused state. "Has storage IOPS utilization happened to
  // drop below 40%" is not, by itself, proof the system is safe to hand
  // back — the candidate must judge whether the drop came from a real
  // capacity fix or from suppressing the batch job's own progress,
  // which is exactly the "is this safe enough to hand back" judgment
  // candidate_declared exists to test.
  completion: { mode: "candidate_declared", acceptableCondition },
};
