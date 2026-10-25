import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { dataPipelineFreshnessCollapseRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const dataPipelineFreshnessCollapseSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "processorStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Stream Processor has entered a critical backlog state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Stream Processor has recovered.",
      },
    },
    {
      key: "warehouseStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "The Warehouse has entered a critical write-contention state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "The Warehouse has recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "tier1FreshnessSeconds",
      trackPeak: true,
      threshold: {
        value: 120,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Tier-1 operational freshness has crossed its 120-second SLO.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Tier-1 operational freshness has recovered back within its SLO.",
      },
    },
    {
      key: "tier2BacklogCount",
      trackPeak: true,
    },
    {
      key: "warehouseWriteLockWaitMs",
      trackPeak: true,
      threshold: {
        value: 1_000,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "Warehouse write lock wait time has crossed 1 second — real durability/correctness risk, not merely slow writes.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "Warehouse write lock wait time has dropped back below 1 second.",
      },
    },
    {
      key: "droppedEventCount",
      trackPeak: true,
    },
    {
      key: "processorLagSeconds",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: dataPipelineFreshnessCollapseRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase6d3.md section 10, same rigor as
  // distributed-coordination-failure/definition.ts and
  // ledger-reconciliation-divergence/definition.ts) ────────────────────
  //
  // Reachable terminal/stable rule states, classified by their REAL
  // authored values (tier1FreshnessSeconds / tier2BacklogCount /
  // warehouseWriteSuccessRate / droppedEventCount / pipelineStatus /
  // servingFreshnessStatus):
  //
  //   baseline-lagging                          UNSAFE  30 / 90   / 100 / 0   / diverging         / fresh
  //   baseline-sustained-lagging                UNSAFE  50 / 480  / 100 / 0   / diverging         / fresh
  //   throttled-no-scaling                      UNSAFE  45 / 240  / 100 / 0   / diverging         / fresh
  //   backpressure-no-scaling                   UNSAFE  40 / 180  / 100 / 0   / diverging         / fresh
  //   small-batch-no-scaling                    UNSAFE  46 / 460  / 100 / 0   / diverging         / fresh
  //   processor-scaled-warehouse-contention      UNSAFE  40 / 420  / 58  / 0   / contended         / fresh
  //   partial-warehouse-protection-concurrency   UNSAFE  35 / 350  / 82  / 0   / contended         / fresh
  //   partial-warehouse-protection-cadence       UNSAFE  35 / 350  / 85  / 0   / contended         / fresh
  //   tier1-breached-unmanaged                   UNSAFE  160/ 410  / 99  / 0   / diverging         / tier1-breached
  //   drop-events-trap-active                    UNSAFE  25 / 40   / 99  / 140 / integrity-violated/ integrity-violated
  //   drop-events-trap-sustained                 UNSAFE  30 / 60   / 99  / 480 / integrity-violated/ integrity-violated
  //   drop-events-scarred-live-safe              UNSAFE     28 / 55   / 100 / 140 / integrity-violated/ integrity-violated
  //   fully-protected-warehouse-safe-early        ACCEPTABLE 25 / 70   / 99  / 0   / draining  / fresh  (reachable BEFORE sustainedLag ever fires — see note below: caught and fully protected early enough that Tier-1 was never at risk in the first place)
  //   safely-scaled-just-engaged                 UNSAFE      20 / 380  / 99  / 0   / draining  / fresh  (tier2Backlog 380 > acceptable's 200 ceiling — tick-0 proof drain is not instant)
  //   draining-window1-unthrottled                ACCEPTABLE 16 / 180 / 99 / 0 / draining / fresh
  //   draining-window1-throttled                  ACCEPTABLE 15 / 95  / 99 / 0 / draining / fresh
  //   draining-window2-unthrottled                ACCEPTABLE 14 / 65  / 99 / 0 / draining / fresh
  //   draining-window2-throttled                  ACCEPTABLE 12 / 25  / 99 / 0 / draining / fresh
  //   fully-recovered                             OPTIMAL    10 / 0   / 100/ 0 / recovered / fresh
  //
  // Every UNSAFE state fails at least one real, named gate: either
  // pipelineStatus is not yet "draining"/"recovered" (new backlog
  // growth has not genuinely stopped, or the Warehouse is actively
  // contended), or warehouseWriteSuccessRate is below 99% (Warehouse
  // durability/correctness is NOT preserved — business invariant #4),
  // or tier1FreshnessSeconds exceeds its 120s SLO (business invariant
  // #1 breached), or droppedEventCount is nonzero (business invariant
  // #3 — events dropped merely to improve lag metrics — permanently and
  // unconditionally disqualifying, however healthy every other metric
  // reads; drop-events-scarred-live-safe proves this explicitly: lag/
  // backlog/freshness all read calm, but droppedEventCount is carried
  // forward from history and never resets).
  //
  // safely-scaled-just-engaged is the deliberate tick-zero recovery-lag
  // proof: every live control is already correctly set (safe scaling,
  // Tier-1 prioritized, no drops), yet tier2BacklogCount (380) is still
  // above the acceptable ceiling (200) because no real drain time has
  // elapsed yet — "fixed the configuration" is necessary but,
  // immediately after fixing it, not yet sufficient to hand back.
  //
  // fully-protected-warehouse-safe-early is a genuine ALTERNATE STRONG
  // PATH, not a flaw: it is reachable only by engaging BOTH Warehouse-
  // protection levers (writer concurrency + checkpoint cadence) early,
  // before sustainedLag ever fires — i.e. before the backlog has had
  // time to compound. Caught this early, datasetPriority is not yet
  // load-bearing because the backlog never grows large enough within
  // that window to threaten Tier-1's SLO regardless of priority
  // ordering (tier1-breached-unmanaged is only reachable once
  // sustainedLag is true). This does NOT mean the Tier-1 judgment can
  // be skipped in general — a candidate who reacts late (post-
  // sustainedLag) without ever setting datasetPriority to "tier1-first"
  // still breaches Tier-1's SLO (tier1-breached-unmanaged), and a
  // candidate who tries only ONE of the two Warehouse levers still
  // contends the Warehouse (the partial-protection rules) regardless of
  // timing. Reaching this early-acceptable state therefore still
  // requires correctly identifying that BOTH Warehouse levers are
  // required together AND reacting before the backlog compounds —
  // genuine judgment, not a single random lever flip.
  //
  // ACCEPTABLE states all satisfy: tier1FreshnessSeconds <= 120 AND
  // tier2BacklogCount <= 200 AND warehouseWriteSuccessRate >= 99 AND
  // droppedEventCount = 0 AND pipelineStatus = "draining" — genuinely
  // bounded, genuinely still shrinking, Tier-1 protected, Warehouse
  // safe, correctness never compromised, even though tier2BacklogCount
  // has not yet reached zero. This is exactly the scenario spec's
  // "Tier-1 data within SLO, lower-priority datasets delayed, backlog
  // bounded and draining, Warehouse safe" legitimate degraded state,
  // modeled with real, distinct, non-reset-to-zero historical/backlog
  // numbers rather than a cosmetic placeholder.
  //
  // OPTIMAL (fully-recovered) requires the longest elapsed drain window
  // on top of every ACCEPTABLE gate, with tier2BacklogCount at genuine
  // zero and pipelineStatus explicitly "recovered".
  //
  // Because the central judgment this scenario tests is "is this
  // specific mixed state — Tier-1 protected, Warehouse safe, Tier-2
  // backlog nonzero but bounded and shrinking — good enough to hand
  // back, or does it need more drain time" (an inherently judgment-
  // laden question with a real, deliberately generous ACCEPTABLE tier,
  // not a single objective zero/nonzero gate), this scenario is
  // `candidate_declared`, not `automatic`. The judgment tested is in
  // CHOOSING the right combination of controls (safe scaling + Tier-1
  // priority + no drops) and recognizing that the Warehouse contention
  // trap and the Tier-1 judgment trap are independent failure modes
  // that both must be avoided — not in deciding whether an ambiguous
  // handback state is good enough once the right controls are already
  // engaged and enough time has passed.
  completion: {
    mode: "candidate_declared",
    acceptableCondition,
  },
};
