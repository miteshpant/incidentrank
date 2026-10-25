import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  BACKPRESSURE_KEY,
  BATCH_SIZE_KEY,
  CHECKPOINT_CADENCE_KEY,
  DATASET_PRIORITY_KEY,
  DROP_EVENTS_KEY,
  LOW_PRIORITY_INGESTION_THROTTLE_KEY,
  PROCESSOR_CONCURRENCY_KEY,
  WAREHOUSE_WRITER_CONCURRENCY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "source-systems": "healthy",
  ingestion: "healthy",
  "stream-processor": "healthy",
  warehouse: "healthy",
  "serving-layer": "healthy",
};

const laggingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "degraded",
  "serving-layer": "degraded",
};

const laggingCriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "critical",
  "serving-layer": "critical",
};

const warehouseContendedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "degraded",
  warehouse: "critical",
  "serving-layer": "degraded",
};

const warehousePartiallyContendedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "degraded",
  warehouse: "degraded",
  "serving-layer": "degraded",
};

const tier1BreachedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "critical",
  "serving-layer": "critical",
};

const draininHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "degraded",
  "serving-layer": "degraded",
};

const dropEventsHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "stream-processor": "critical",
  "serving-layer": "critical",
};

/**
 * Authored rule table for Data Pipeline Freshness Collapse, ordered
 * most-specific-first (first-match-wins, top-to-bottom — see
 * packages/simulator's rule-matching semantics). Correctness-violation
 * traps are checked first, then every fully-specific "processor scaled +
 * other controls" combination (safe-recovery tiers, the Tier-1
 * judgment trap, the partial-warehouse-protection traps), and only
 * LAST among the "processorConcurrency: high" rules does the generic
 * "processor-scaled-warehouse-contention" catch-all appear — it has no
 * constraint on warehouseWriterConcurrency/checkpointCadence/
 * datasetPriority, so every rule above it that DOES constrain those
 * must be listed first or it would permanently shadow them.
 *
 * ROOT CAUSE: the Stream Processor begins falling behind real-time
 * (processorLagging). Source Systems and Ingestion success never move
 * — this must not look like an ingestion/availability outage. The
 * visible symptoms are downstream: processorLagSeconds,
 * tier1/tier2FreshnessSeconds, tier1/tier2BacklogCount.
 *
 * REQUIRED PRESSURE-TRANSFER MECHANISM (phase6d3.md section 13 /
 * scenario spec): naively raising processorConcurrency to "high" without
 * also raising warehouseWriterConcurrency AND relaxing checkpointCadence
 * lets more concurrent writers hit the Warehouse's existing write path
 * than it can safely absorb — warehouseWriteSuccessRate and
 * warehouseWriteLockWaitMs both read MEASURABLY WORSE than the
 * unmitigated baseline, not merely "no better." See
 * "processor-scaled-warehouse-contention" and the two
 * "partial-warehouse-protection-*" rules (proving BOTH levers are
 * independently required, neither one alone is sufficient).
 *
 * TIERED-FRESHNESS JUDGMENT (business invariants #1/#2): Tier-1
 * operational data must stay within its 120-second SLO
 * (tier1FreshnessSeconds). Tier-2 analytical data may lag substantially
 * — there is no SLO on tier2FreshnessSeconds. datasetPriority =
 * "tier1-first" is what actually protects Tier-1 under backlog;
 * "balanced" (the default) treats both tiers identically, which lets
 * Tier-1 freshness breach its SLO once the lag is sustained even with
 * the Warehouse fully protected — see "tier1-breached-unmanaged" below:
 * protecting the Warehouse is necessary but not sufficient.
 *
 * HISTORICAL DAMAGE MODEL (phase6d3.md's doctrine — the forbidden
 * dropEvents lever): droppedEventCount only ever increases while
 * dropEvents is "on" AND a real backlog exists to drop from. The moment
 * dropEvents is turned back off, NO new drops occur — but
 * droppedEventCount is never reset; it freezes at whatever it last
 * reached. Longer exposure (dropExposureWindowElapsed) authors a larger
 * frozen count than a shorter one, mirroring Ledger Reconciliation
 * Divergence's missingEntryCount/duplicateSettlementEntryCount pattern.
 *
 * RECOVERY LAG (phase6d3.md section 14): once new backlog growth has
 * genuinely stopped AND the Warehouse is protected AND Tier-1 is
 * protected, tier2BacklogCount does not reach zero on the same tick —
 * it drains across DRAIN_WINDOW_1/2/FULLY_RECOVERED, never instantly.
 */
export const dataPipelineFreshnessCollapseRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAP — dropping events. Checked first: wins
  // regardless of every other control, because a correctness violation
  // is never acceptable however healthy lag metrics look.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "drop-events-trap-sustained",
    when: {
      triggerEquals: { processorLagging: true, sustainedLag: true, dropExposureWindowElapsed: true },
      controlEquals: { [DROP_EVENTS_KEY]: true },
    },
    incidentState: "drop-events-trap-sustained",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 20,
      processorStatus: "warning",
      tier1FreshnessSeconds: 30,
      tier2FreshnessSeconds: 90,
      tier1BacklogCount: 2,
      tier2BacklogCount: 60,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 20,
      droppedEventCount: 480,
      servingFreshnessStatus: "integrity-violated",
      pipelineStatus: "integrity-violated",
    },
    componentHealth: dropEventsHealth,
  },
  {
    id: "drop-events-trap-active",
    when: {
      triggerEquals: { processorLagging: true },
      controlEquals: { [DROP_EVENTS_KEY]: true },
    },
    incidentState: "drop-events-trap-active",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 15,
      processorStatus: "warning",
      tier1FreshnessSeconds: 25,
      tier2FreshnessSeconds: 70,
      tier1BacklogCount: 1,
      tier2BacklogCount: 40,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 15,
      droppedEventCount: 140,
      servingFreshnessStatus: "integrity-violated",
      pipelineStatus: "integrity-violated",
    },
    componentHealth: dropEventsHealth,
  },
  // Scarred-but-live-safe: dropEvents has since been turned back off
  // (no new drops this tick), but droppedEventCount is carried forward
  // unchanged from whatever it last reached — proof the historical
  // counter does not silently reset when the live lever is fixed.
  //
  // Deliberately gated on dropEverEngagedWindowElapsed — a SEPARATE,
  // early, narrow trigger window (see timed-events.ts) distinct from
  // sustainedLag/drainWindow*, and deliberately does NOT constrain any
  // of the safe-scaling controls (processorConcurrency/
  // warehouseWriterConcurrency/checkpointCadence/datasetPriority). This
  // keeps it from ever shadowing the real safe-scaling/draining/
  // fully-recovered rules below, which all require sustainedLag/
  // drainWindow* triggers this rule does not check — and conversely
  // this rule's own window closes (see timed-events.ts) well before
  // sustainedLag ever fires, so once sustainedLag is true this rule can
  // no longer match at all regardless of control values, leaving the
  // real safe-scaling progression fully reachable afterward. This is
  // the honest, engine-respecting way to prove non-reset: it is tested
  // in its own early window, never overlapping the later recovery
  // timeline.
  {
    id: "drop-events-scarred-live-safe",
    when: {
      triggerEquals: {
        processorLagging: true,
        sustainedLag: false,
        dropExposureWindowElapsed: true,
      },
      controlEquals: { [DROP_EVENTS_KEY]: false },
    },
    incidentState: "drop-events-scarred-live-safe",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 70,
      processorStatus: "warning",
      tier1FreshnessSeconds: 28,
      tier2FreshnessSeconds: 85,
      tier1BacklogCount: 1,
      tier2BacklogCount: 55,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 140,
      servingFreshnessStatus: "integrity-violated",
      pipelineStatus: "integrity-violated",
    },
    componentHealth: dropEventsHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE SCALING — processor concurrency raised, Warehouse fully
  // protected (writer concurrency raised AND checkpoint cadence
  // relaxed), Tier-1 prioritized, no dropped events. Listed BEFORE the
  // generic contention trap and the partial-protection traps so this
  // specific, fully-protected combination is recognized as safe rather
  // than shadowed by a less-specific rule.
  // ══════════════════════════════════════════════════════════════════

  // ── OPTIMAL: full recovery. Safe scaling + Tier-1 protected + fully
  // elapsed drain window — processor caught up, Tier-2 backlog at zero,
  // Warehouse safe.
  {
    id: "fully-recovered",
    when: {
      triggerEquals: { processorLagging: true, drainWindowFullyRecoveredElapsed: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "tier1-first",
        [DROP_EVENTS_KEY]: false,
      },
    },
    incidentState: "fully-recovered",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 2,
      processorStatus: "normal",
      tier1FreshnessSeconds: 10,
      tier2FreshnessSeconds: 25,
      tier1BacklogCount: 0,
      tier2BacklogCount: 0,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "recovered",
    },
    componentHealth: healthyHealth,
  },

  // ── ACCEPTABLE tiers: new backlog growth stopped, Tier-1 protected,
  // Warehouse safe, Tier-2 backlog BOUNDED and demonstrably draining
  // but not yet zero. Drain windows 1/2, with/without the extra help of
  // lowPriorityIngestionThrottle (genuinely accelerates the drain,
  // proving it is not a dead control).
  {
    id: "draining-window2-throttled",
    when: {
      triggerEquals: {
        processorLagging: true,
        sustainedLag: true,
        drainWindow2Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "tier1-first",
        [DROP_EVENTS_KEY]: false,
        [LOW_PRIORITY_INGESTION_THROTTLE_KEY]: true,
      },
    },
    incidentState: "draining-window2-throttled",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 5,
      processorStatus: "normal",
      tier1FreshnessSeconds: 12,
      tier2FreshnessSeconds: 60,
      tier1BacklogCount: 0,
      tier2BacklogCount: 25,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 5,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window2-unthrottled",
    when: {
      triggerEquals: {
        processorLagging: true,
        sustainedLag: true,
        drainWindow2Elapsed: true,
        drainWindowFullyRecoveredElapsed: false,
      },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "tier1-first",
        [DROP_EVENTS_KEY]: false,
        [LOW_PRIORITY_INGESTION_THROTTLE_KEY]: false,
      },
    },
    incidentState: "draining-window2-unthrottled",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 7,
      processorStatus: "normal",
      tier1FreshnessSeconds: 14,
      tier2FreshnessSeconds: 80,
      tier1BacklogCount: 0,
      tier2BacklogCount: 65,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 5,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-throttled",
    when: {
      triggerEquals: {
        processorLagging: true,
        sustainedLag: true,
        drainWindow1Elapsed: true,
        drainWindow2Elapsed: false,
      },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "tier1-first",
        [DROP_EVENTS_KEY]: false,
        [LOW_PRIORITY_INGESTION_THROTTLE_KEY]: true,
      },
    },
    incidentState: "draining-window1-throttled",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 9,
      processorStatus: "normal",
      tier1FreshnessSeconds: 15,
      tier2FreshnessSeconds: 140,
      tier1BacklogCount: 0,
      tier2BacklogCount: 95,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 8,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "draining",
    },
    componentHealth: draininHealth,
  },
  {
    id: "draining-window1-unthrottled",
    when: {
      triggerEquals: {
        processorLagging: true,
        sustainedLag: true,
        drainWindow1Elapsed: true,
        drainWindow2Elapsed: false,
      },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "tier1-first",
        [DROP_EVENTS_KEY]: false,
        [LOW_PRIORITY_INGESTION_THROTTLE_KEY]: false,
      },
    },
    incidentState: "draining-window1-unthrottled",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 11,
      processorStatus: "normal",
      tier1FreshnessSeconds: 16,
      tier2FreshnessSeconds: 180,
      tier1BacklogCount: 0,
      tier2BacklogCount: 180,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 8,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "draining",
    },
    componentHealth: draininHealth,
  },

  // ── Just-engaged tick-zero proof: safe scaling flipped this instant
  // (no elapsed drain window yet) — Tier-2 backlog is exactly what it
  // was at the moment safe scaling started, proving the drain is not
  // instant.
  {
    id: "safely-scaled-just-engaged",
    when: {
      triggerEquals: {
        processorLagging: true,
        sustainedLag: true,
        drainWindow1Elapsed: false,
      },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "tier1-first",
        [DROP_EVENTS_KEY]: false,
      },
    },
    incidentState: "safely-scaled-just-engaged",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 18,
      processorStatus: "warning",
      tier1FreshnessSeconds: 20,
      tier2FreshnessSeconds: 220,
      tier1BacklogCount: 0,
      tier2BacklogCount: 380,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 10,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "draining",
    },
    componentHealth: draininHealth,
  },

  // ── Warehouse-protected but Tier-1 not prioritized ("balanced"):
  // scaling is safe for the Warehouse, but with dataset priority left
  // balanced, Tier-1 is not actually being protected from the still-
  // substantial Tier-2 volume competing for the same processor
  // throughput, and once the lag has been sustained long enough, Tier-1
  // freshness itself breaches its 120s SLO. This is the scenario's
  // second real trap: "I protected the Warehouse but never protected
  // Tier-1" is still unsafe. Listed before the generic contention trap
  // since it also matches processorConcurrency: high and is more
  // specific (constrains datasetPriority too).
  {
    id: "tier1-breached-unmanaged",
    when: {
      triggerEquals: { processorLagging: true, sustainedLag: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DATASET_PRIORITY_KEY]: "balanced",
        [DROP_EVENTS_KEY]: false,
      },
    },
    incidentState: "tier1-breached-unmanaged",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 30,
      processorStatus: "warning",
      tier1FreshnessSeconds: 160,
      tier2FreshnessSeconds: 190,
      tier1BacklogCount: 35,
      tier2BacklogCount: 410,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 10,
      droppedEventCount: 0,
      servingFreshnessStatus: "tier1-breached",
      pipelineStatus: "diverging",
    },
    componentHealth: tier1BreachedHealth,
  },

  // ── Fully protected, before sustained-lag/drain triggers have fired
  // (e.g. caught early, right after onset): both Warehouse-protection
  // levers are engaged, so the Warehouse is safe regardless of
  // datasetPriority or elapsed drain time — Warehouse safety depends
  // only on the two Warehouse-side controls, never on dataset priority
  // or elapsed time. This is reachable any time the fully-protected
  // combination holds but neither "sustainedLag" nor a drain window has
  // fired yet (the earliest point safe scaling can be verified safe).
  {
    id: "fully-protected-warehouse-safe-early",
    when: {
      triggerEquals: { processorLagging: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
        [DROP_EVENTS_KEY]: false,
      },
    },
    incidentState: "fully-protected-warehouse-safe-early",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 20,
      processorStatus: "warning",
      tier1FreshnessSeconds: 25,
      tier2FreshnessSeconds: 60,
      tier1BacklogCount: 1,
      tier2BacklogCount: 70,
      warehouseWriteSuccessRate: 99,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 10,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "draining",
    },
    componentHealth: draininHealth,
  },

  // ── Partial Warehouse protection: writer concurrency raised but
  // checkpoint cadence still normal (or vice versa) while processor is
  // scaled — contention is measurably reduced relative to the full
  // contention trap below, but not eliminated, proving BOTH levers are
  // genuinely required together, neither one alone is sufficient.
  // Listed before the generic contention trap since both are more
  // specific (constrain checkpointCadence/warehouseWriterConcurrency
  // explicitly rather than leaving them unconstrained).
  {
    id: "processor-scaled-partial-warehouse-protection-concurrency-only",
    when: {
      triggerEquals: { processorLagging: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "high",
        [CHECKPOINT_CADENCE_KEY]: "normal",
      },
    },
    incidentState: "partial-warehouse-protection-concurrency-only",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 22,
      processorStatus: "warning",
      tier1FreshnessSeconds: 35,
      tier2FreshnessSeconds: 150,
      tier1BacklogCount: 3,
      tier2BacklogCount: 350,
      warehouseWriteSuccessRate: 82,
      warehouseStatus: "degraded",
      warehouseWriteLockWaitMs: 650,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "contended",
    },
    componentHealth: warehousePartiallyContendedHealth,
  },
  {
    id: "processor-scaled-partial-warehouse-protection-cadence-only",
    when: {
      triggerEquals: { processorLagging: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "high",
        [WAREHOUSE_WRITER_CONCURRENCY_KEY]: "normal",
        [CHECKPOINT_CADENCE_KEY]: "relaxed",
      },
    },
    incidentState: "partial-warehouse-protection-cadence-only",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 22,
      processorStatus: "warning",
      tier1FreshnessSeconds: 35,
      tier2FreshnessSeconds: 150,
      tier1BacklogCount: 3,
      tier2BacklogCount: 350,
      warehouseWriteSuccessRate: 85,
      warehouseStatus: "degraded",
      warehouseWriteLockWaitMs: 520,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "contended",
    },
    componentHealth: warehousePartiallyContendedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // REQUIRED PRESSURE-TRANSFER TRAP — the generic catch-all: processor
  // concurrency raised to "high" with NEITHER full protection NOR one
  // of the specific partial-protection combinations above (i.e. both
  // warehouseWriterConcurrency AND checkpointCadence still at their
  // default "normal" values) — the naive, most-tempting "just scale
  // it" response. Listed LAST among the "processorConcurrency: high"
  // rules so every more-specific protected/partially-protected/
  // Tier-1-judgment combination above is recognized first.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "processor-scaled-warehouse-contention",
    when: {
      triggerEquals: { processorLagging: true },
      controlEquals: { [PROCESSOR_CONCURRENCY_KEY]: "high" },
    },
    incidentState: "processor-scaled-warehouse-contention",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 25,
      processorStatus: "warning",
      tier1FreshnessSeconds: 40,
      tier2FreshnessSeconds: 200,
      tier1BacklogCount: 4,
      tier2BacklogCount: 420,
      warehouseWriteSuccessRate: 58,
      warehouseStatus: "critical",
      warehouseWriteLockWaitMs: 2_400,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "contended",
    },
    componentHealth: warehouseContendedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // NO SCALING — processor concurrency left at "normal". Other controls
  // may genuinely help bound Tier-2 backlog growth or reduce Warehouse
  // write duration, but none of them can make the processor itself
  // catch up with real-time.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "throttled-no-scaling",
    when: {
      triggerEquals: { processorLagging: true, sustainedLag: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "normal",
        [LOW_PRIORITY_INGESTION_THROTTLE_KEY]: true,
      },
    },
    incidentState: "throttled-no-scaling",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 260,
      processorStatus: "critical",
      tier1FreshnessSeconds: 45,
      tier2FreshnessSeconds: 320,
      // Identical to baseline-sustained-lagging's tier1BacklogCount —
      // the low-priority throttle only ever touches Tier-2 ingestion;
      // it must never change Tier-1's backlog, by design.
      tier1BacklogCount: 8,
      tier2BacklogCount: 240,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "diverging",
    },
    componentHealth: laggingCriticalHealth,
  },
  {
    id: "backpressure-no-scaling",
    when: {
      triggerEquals: { processorLagging: true, sustainedLag: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "normal",
        [BACKPRESSURE_KEY]: true,
      },
    },
    incidentState: "backpressure-no-scaling",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 240,
      processorStatus: "critical",
      tier1FreshnessSeconds: 40,
      tier2FreshnessSeconds: 300,
      tier1BacklogCount: 5,
      tier2BacklogCount: 180,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "diverging",
    },
    componentHealth: laggingCriticalHealth,
  },
  // Small batch size alone: shortens individual Warehouse writes,
  // genuinely reducing lock wait relative to baseline, but with
  // processor concurrency still normal, this does nothing for the
  // actual processing throughput problem.
  {
    id: "small-batch-no-scaling",
    when: {
      triggerEquals: { processorLagging: true, sustainedLag: true },
      controlEquals: {
        [PROCESSOR_CONCURRENCY_KEY]: "normal",
        [BATCH_SIZE_KEY]: "small",
      },
    },
    incidentState: "small-batch-no-scaling",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      // Identical to baseline-sustained-lagging's processorLagSeconds —
      // batch size only affects the shape/duration of individual
      // Warehouse writes, never processor throughput itself.
      processorLagSeconds: 300,
      processorStatus: "critical",
      tier1FreshnessSeconds: 46,
      tier2FreshnessSeconds: 330,
      tier1BacklogCount: 8,
      tier2BacklogCount: 460,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 40,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "diverging",
    },
    componentHealth: laggingCriticalHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — lag active, no meaningful action taken yet.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "baseline-sustained-lagging",
    when: { triggerEquals: { processorLagging: true, sustainedLag: true } },
    incidentState: "baseline-sustained-lagging",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 300,
      processorStatus: "critical",
      tier1FreshnessSeconds: 50,
      tier2FreshnessSeconds: 340,
      tier1BacklogCount: 8,
      tier2BacklogCount: 480,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "diverging",
    },
    componentHealth: laggingCriticalHealth,
  },
  {
    id: "baseline-lagging",
    when: { triggerEquals: { processorLagging: true } },
    incidentState: "baseline-lagging",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 90,
      processorStatus: "warning",
      tier1FreshnessSeconds: 30,
      tier2FreshnessSeconds: 110,
      tier1BacklogCount: 2,
      tier2BacklogCount: 90,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "diverging",
    },
    componentHealth: laggingHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      sourceSystemsHealthPct: 100,
      ingestionSuccessRate: 99,
      processorLagSeconds: 0,
      processorStatus: "normal",
      tier1FreshnessSeconds: 10,
      tier2FreshnessSeconds: 20,
      tier1BacklogCount: 0,
      tier2BacklogCount: 0,
      warehouseWriteSuccessRate: 100,
      warehouseStatus: "normal",
      warehouseWriteLockWaitMs: 0,
      droppedEventCount: 0,
      servingFreshnessStatus: "fresh",
      pipelineStatus: "recovered",
    },
    componentHealth: healthyHealth,
  },
];
