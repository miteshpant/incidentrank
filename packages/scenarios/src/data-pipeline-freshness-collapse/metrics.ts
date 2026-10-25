import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Live-traffic health (the DECOY signal) ──────────────────────────
  // Source Systems and Ingestion both stay healthy the entire incident,
  // by design — the root cause is a Stream Processor bottleneck, never
  // an ingestion failure. A candidate who only watches ingestion health
  // never discovers anything is wrong.
  sourceSystemsHealthPct: 100,
  ingestionSuccessRate: 99,

  // ── Stream Processor health (the REAL bottleneck) ───────────────────
  // Seconds the processor is currently behind real-time. Zero is
  // healthy. Climbs once the incident starts; whether and how fast it
  // drains depends on real, authored mechanics in rules.ts, never an
  // instant reset.
  processorLagSeconds: 0,
  // Severity field summarizing processor health.
  processorStatus: "normal",

  // ── Tiered freshness (business invariant #1/#2) ─────────────────────
  // Seconds since the most recent Tier-1 operational event was reflected
  // in the Warehouse/Serving Layer. The authored SLO is 120 seconds —
  // see revenue-and-cost.ts's successCondition/acceptableCondition and
  // the failureCondition. This must stay low no matter what else is
  // happening.
  tier1FreshnessSeconds: 10,
  // Seconds since the most recent Tier-2 analytical event was reflected
  // downstream. Business invariant #2 explicitly allows this to lag
  // substantially during the incident — there is no SLO on this field.
  tier2FreshnessSeconds: 20,

  // ── Backlog (recoverable, must be bounded + draining, not frozen) ───
  // Count of not-yet-processed Tier-1 events queued ahead of the
  // processor. Should stay small/bounded given dataset priority is
  // genuinely protecting Tier-1.
  tier1BacklogCount: 0,
  // Count of not-yet-processed Tier-2 events queued ahead of the
  // processor. Allowed to grow substantially during the incident
  // (invariant #2) as long as it is bounded and demonstrably draining
  // once the incident resolves, never frozen forever.
  tier2BacklogCount: 0,

  // ── Warehouse correctness/durability (the PRESSURE-TRANSFER target) ──
  // Percent of Warehouse write attempts currently succeeding without
  // lock-timeout/contention errors. 100 is healthy. This is what
  // measurably gets WORSE when processor concurrency is raised without
  // also protecting the Warehouse (warehouseWriterConcurrency +
  // checkpointCadence) — the required pressure-transfer trap.
  warehouseWriteSuccessRate: 100,
  // Severity field summarizing Warehouse health. Never allowed to read
  // "critical" in any state this scenario classifies as safe — Warehouse
  // correctness/durability must be preserved (business invariant #4).
  warehouseStatus: "normal",
  // Seconds a Warehouse write currently waits behind lock/contention
  // before landing. Zero is healthy. Rises specifically when processor
  // concurrency outpaces Warehouse writer concurrency/checkpoint
  // cadence — the pressure-transfer mechanism's primary visible metric.
  warehouseWriteLockWaitMs: 0,

  // ── Historical / cumulative damage (phase6d3.md's doctrine) ──────────
  // Events discarded outright by the forbidden dropEvents lever. This
  // can only ever increase — there is no control, mode, or elapsed time
  // that reduces it. Dropping an event to make lag metrics look better
  // is a real, permanent correctness loss (business invariant #3), not
  // a recoverable backlog state. See rules.ts / action-classifications.
  droppedEventCount: 0,

  // ── Serving-layer freshness signal (state, not a control) ───────────
  // Whether the Serving Layer is currently serving Tier-1 data fresh
  // within SLO, with Tier-2 reports explicitly marked stale, or whether
  // Tier-1 itself has slipped. Read by scoring and by success/acceptable
  // conditions as the single authoritative summary.
  //   "fresh"            — Tier-1 within SLO, Tier-2 may be stale.
  //   "tier1-breached"   — Tier-1 itself has slipped past its SLO.
  //   "integrity-violated" — events were dropped; correctness invariant
  //                          broken regardless of freshness numbers.
  servingFreshnessStatus: "fresh",

  // Generic string-state summary of the overall pipeline, read by
  // scoring's finalStringEquals/NotEquals measures and by success/
  // acceptable conditions.
  //   "diverging"  — processor falling further behind; backlog growing.
  //   "contended"  — Warehouse contention actively worsening
  //                  (pressure-transfer trap engaged).
  //   "draining"   — new backlog growth stopped; tier2 backlog bounded
  //                  and demonstrably shrinking; Warehouse safe.
  //   "recovered"  — processor caught up, backlog at/near zero,
  //                  Warehouse safe.
  //   "integrity-violated" — events were dropped; never improves.
  pipelineStatus: "recovered",
};
