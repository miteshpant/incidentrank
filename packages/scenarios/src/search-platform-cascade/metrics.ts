import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Ranking Service's own observed response latency, milliseconds.
  // Healthy baseline is fast; the incident raises this moderately (not
  // a hard failure) — the root mechanical cause of everything else.
  rankingLatencyMs: 90,

  // Number of search requests the Query Coordinator currently has
  // in-flight (accepted, not yet responded to). This is the direct
  // mechanical consequence of waiting longer on Ranking: every query
  // held open longer accumulates with the next one arriving behind it.
  coordinatorInFlightRequests: 40,

  // Index Cluster A/B connection counts the Query Coordinator is
  // currently holding open. These climb only because the Coordinator
  // holds its FULL set of per-query connections (including index calls
  // that already returned) open until the entire query — including the
  // Ranking wait — resolves. Index Cluster A/B's own query-serving
  // latency never changes; this is purely held-connection pressure.
  indexClusterAConnections: 60,
  indexClusterBConnections: 60,

  // Feature Store queries-per-second the Ranking Service issues against
  // it. Rises because the same held-open queries attempting to rank
  // mean more concurrent Feature Store lookups in flight at once, and
  // because a slow/retrying Ranking Service re-requests features more
  // often per query under its own retry behavior.
  featureStoreQps: 800,

  // Search API's own p99 latency, milliseconds — the client-visible
  // symptom, a pure queueing consequence of how long queries sit
  // waiting on the Coordinator.
  searchApiP99Ms: 220,

  // Index Cluster A/B's own internal query-serving latency. Stays
  // healthy throughout — the incident never touches index data health.
  indexClusterALatencyMs: 35,
  indexClusterBLatencyMs: 35,

  // Basic search success rate — whether a client got ANY search
  // response at all, independent of ranking quality. Must stay high
  // per the "basic search is business-critical" invariant.
  basicSearchSuccessRatePercent: 99.8,

  // Percentage of responses currently including live re-ranking.
  // Drops to 0 when ranking is excluded/degraded — expected and
  // acceptable, never itself a failure signal.
  rankedResponsePercent: 100,

  // HISTORICAL/CUMULATIVE DAMAGE (phase6d.2.md section 9): count of
  // search responses served with content outside the authored
  // staleness/relevance bound — i.e. a genuine correctness violation,
  // not merely "ranking was skipped." This only increments while
  // PARTIAL_RESULT_MODE_KEY is "on" AND CACHE_KEY is "off" AND ranking
  // is excluded/degraded simultaneously (the unsafe combination
  // documented in rules.ts) — the Coordinator, with no bounded cache to
  // fall back to and ranking unavailable, returns whatever stale
  // partial content it has on hand with no freshness guarantee. It
  // NEVER decrements and is NEVER reset by rules.ts regardless of what
  // the candidate fixes afterward — only a dedicated reconciliation
  // control (queryResultCacheMode engaged, see rules.ts) halts further
  // growth, and the backlog of ALREADY-SERVED violations remains part
  // of the historical record for the rest of the attempt.
  staleOrUnrelatedResultsServedCount: 0,

  // Severity field: the Query Coordinator's own held-connection health.
  coordinatorPressureStatus: "normal",

  // Generic string-state field recording the dominant mechanism
  // currently governing the response path, read by scoring:
  //   "full-ranking"            -- ranking live, healthy baseline.
  //   "degraded-quality-safe"   -- ranking excluded/degraded, base
  //                                search served, no correctness risk.
  //   "scale-the-symptom"       -- API/coordinator capacity raised
  //                                while ranking still fully in path --
  //                                the pressure-transfer trap.
  //   "unsafe-partial-results"  -- partial-result mode on without a
  //                                bounded cache fallback while ranking
  //                                is out of the path -- the
  //                                correctness-violating path.
  //   "restored-too-early"      -- ranking restored before the
  //                                coordinator drain window elapsed --
  //                                the sequencing retrigger.
  //   "restored-safely"         -- ranking selectively restored AFTER
  //                                the drain window, fully healthy.
  responsePathMode: "full-ranking",
};
