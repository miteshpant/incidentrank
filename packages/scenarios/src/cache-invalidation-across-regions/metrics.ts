import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Global API health (the DECOY signal) ────────────────────────────
  // Global API itself is never the broken component — it stays healthy
  // throughout. A candidate who only watches the API-level success rate
  // never discovers anything is wrong; the real symptoms are per-region
  // cache/origin signals below.
  globalApiSuccessRatePct: 99,

  // ── US Cache — invalidation DELAYED ─────────────────────────────────
  // US receives invalidation messages well after Origin's write
  // actually happened. Until bypass, SWR, or a shortened effective
  // staleness window takes effect, US keeps serving an old cached
  // value for longer than the authored freshness bound.
  usCacheHitRatePct: 97,
  usStaleReadRatePct: 35,
  // Severity field. "normal" once US is within its freshness bound
  // (bypassed, SWR-bounded, or invalidation genuinely caught up);
  // "warning" while serving bounded-but-real staleness;
  // "critical" while staleness is unbounded/growing.
  usFreshnessStatus: "critical",

  // ── EU Cache — invalidation DUPLICATED / REPLAYED ───────────────────
  // EU's consumer is replaying the same invalidation messages
  // repeatedly, evicting and re-fetching healthy keys over and over.
  euCacheHitRatePct: 40,
  euRevalidationStormRatePerMin: 2_400,
  // Severity field. "critical" while blind-replay is actively
  // re-evicting; "normal" once deduplication stops the storm.
  euInvalidationStormStatus: "critical",

  // ── APAC Cache — healthy ─────────────────────────────────────────────
  // APAC's invalidation stream has always been healthy. It carries the
  // majority of steady-state read-hit traffic and must stay that way
  // unless the candidate takes a global action that touches it.
  apacCacheHitRatePct: 98,
  apacFreshnessStatus: "normal",

  // ── Shared Origin Store ──────────────────────────────────────────────
  // The shared blast-radius risk: anything that routes more regional
  // traffic to Origin (US bypass, EU's replay storm, or especially a
  // GLOBAL bypass that also drags in APAC's healthy volume) shows up
  // here. Origin capacity protection is a named business invariant.
  originRequestsPerSec: 1_400,
  originLatencyMs: 220,
  // Severity field — the scenario's shared/global risk signal.
  originStatus: "warning",

  // ── HISTORICAL / CUMULATIVE damage (phase6d3.md section 12) ─────────
  // Count of customer-visible reads that were served stale PAST the
  // authored freshness bound (see revenue-and-cost.ts / rules.ts). This
  // only ever increases while US is actively serving unbounded-stale
  // data (usFreshnessStatus = "critical"); it freezes the instant US's
  // freshness is brought back within bound (bypass, SWR, or a
  // sufficiently short effective TTL) and is never silently reset to
  // zero by that fix — a real non-resetting historical counter, per
  // the same technique Ledger Reconciliation Divergence and API
  // Migration Dual-Write Failure use for their own historical damage
  // models (see rules.ts's doc comment for the exact mechanism).
  staleServesPastFreshnessBoundCount: 0,

  // Generic string-state field read by scoring and by success/
  // acceptable conditions — the single authoritative summary of
  // "what kind of state is the whole system in right now."
  //   "multi-region-degraded"  — US stale, EU storming, both unresolved.
  //   "global-bypass-overload" — the tempting unsafe path: cache
  //                              disabled everywhere, Origin overloaded.
  //   "targeted-partial"       — one region fixed, the other still
  //                              broken, or both fixed but Origin still
  //                              under real pressure from the fix.
  //   "bounded-acceptable"     — US within a real bounded-stale window
  //                              (not unbounded), EU storm stopped,
  //                              Origin protected. Legitimate ACCEPTABLE
  //                              tier, not a failure to be eliminated.
  //   "fully-recovered"        — US within freshness bound via genuine
  //                              invalidation catch-up or a real fix,
  //                              EU storm stopped, Origin healthy.
  // Starts "fully-recovered" (pre-incident default, matching the
  // healthy-default rule below) — the incident's onset timed event is
  // what actually moves this to "multi-region-degraded".
  invalidationSystemStatus: "fully-recovered",
};
