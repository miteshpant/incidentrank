import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Business-critical path (business invariant #1) ─────────────────
  // Checkout/transaction request success rate. This is the metric the
  // candidate must protect above everything else — the scenario's
  // central tension is that maximizing THIS at the expense of optional
  // traffic is correct, while maximizing globalSuccessRatePercent
  // (below) at the expense of this is wrong.
  checkoutSuccessRatePercent: 99.6,
  checkoutLatencyMs: 180,

  // ── Shared cache tier ────────────────────────────────────────────
  // Falls as peak traffic widens the key-access pattern (more distinct
  // product/catalog/search keys requested than the cache was warmed
  // for). This is the FIRST symptom in the authored progression
  // (edge/API pressure rises -> cache effectiveness drops).
  cacheHitRatePercent: 92,

  // ── Shared database tier (business invariant #3: "must not be
  // pushed into collapse") ────────────────────────────────────────────
  // Rises as cache hit rate falls (more cache-miss traffic reaches the
  // DB) and as API concurrency / worker concurrency / optional traffic
  // add more concurrent connection demand. This is the scenario's
  // central protected resource.
  dbConnectionUtilizationPercent: 35,
  // Severity field: "normal" | "warning" | "critical". "critical" means
  // the database is being actively pushed toward collapse RIGHT NOW —
  // the single condition that can never be part of any safe handback
  // state, regardless of how good checkout success rate looks in the
  // same instant.
  dbSaturationStatus: "normal",

  // ── Async tier (business invariant #4: "accepted async work must
  // remain durable"; business invariant #6: "a bounded queue backlog
  // is acceptable if demonstrably draining") ──────────────────────────
  // Count of accepted-but-not-yet-processed async jobs (order
  // confirmations, receipt generation, inventory reconciliation,
  // loyalty crediting). Peak-tracked; grows as synchronous work is
  // deferred and/or as checkout volume rises, shrinks only as workers
  // actually process it over real elapsed time (recovery lag #2 after
  // cache hit rate, modeled independently).
  asyncQueueBacklogCount: 40,
  // "draining" | "stalled" | "growing" — read by success/acceptable
  // conditions as the generic, observable proof the backlog is
  // DEMONSTRABLY draining (invariant #6), not just "currently bounded
  // but about to grow again."
  asyncQueueDrainingStatus: "draining",

  // ── Optional tier (business invariant #2: "may be degraded or
  // disabled") ─────────────────────────────────────────────────────────
  // "normal" | "degraded" | "disabled". The scenario's central
  // sacrifice surface — this is EXPECTED to move away from "normal"
  // on every genuinely strong path.
  searchAvailabilityStatus: "normal",
  searchSuccessRatePercent: 97,

  // ── Aggregate vanity metric — the tempting trap ─────────────────────
  // A naive "maximize everything" candidate watches this number and is
  // rewarded in the short term for keeping optional traffic alive even
  // as checkoutSuccessRatePercent degrades — exactly the wrong
  // optimization target this scenario is designed to punish (see
  // phase6d.4's central judgment question). Scoring never reads this
  // field directly; it exists for the candidate console only, as the
  // deliberate decoy metric a Staff/Principal candidate must learn to
  // ignore in favor of checkoutSuccessRatePercent + dbSaturationStatus.
  globalSuccessRatePercent: 96.5,

  // ── Historical / cumulative damage (non-self-resetting, per
  // phase6d.4.md section 13) ──────────────────────────────────────────
  // Running count of checkout/transaction requests actually DROPPED by
  // a non-policy-based mechanism (loadShedding="random-shed") while the
  // database was under real pressure. Zero on every genuinely safe
  // path — this scenario's "root cause fixed != damage erased" scar is
  // deliberately something a disciplined candidate never triggers at
  // all, rather than something every path accrues some of; triggering
  // it even briefly leaves a permanent, non-decreasing mark that no
  // later correct action erases.
  cumulativeCriticalTrafficDroppedCount: 0,

  // Generic string-state summary of the whole-system posture, read by
  // success/acceptable conditions and by scoring.
  //   "escalating"        — peak pressure rising, no adequate
  //                         intervention yet.
  //   "db-collapse-risk"  — dbSaturationStatus is critical RIGHT NOW;
  //                         never safe regardless of any other metric.
  //   "critical-traffic-dropped" — cumulativeCriticalTrafficDroppedCount
  //                         is nonzero; a permanent correctness-of-
  //                         policy scar, never safe to call resolved
  //                         even once current pressure subsides.
  //   "safe-degraded"     — critical path protected, optional path
  //                         degraded/disabled, queue bounded and
  //                         draining, DB never pushed to collapse.
  //   "optimal-protected"  — fully recovered: critical path at full
  //                         strength, cache/DB/queue all healthy,
  //                         DB never pushed to collapse during this
  //                         attempt's resolution path, and optional
  //                         traffic is either safely restored OR still
  //                         deliberately degraded as an accepted
  //                         tradeoff (both are OPTIMAL once genuinely
  //                         stable; see scoring.ts's note on the two
  //                         alternate strong paths).
  peakEventStatus: "escalating",
};
