import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * Whether the Query Coordinator includes the Ranking Service call in the
 * query path at all. "included" (default) means every query waits on
 * Ranking (and the Feature Store call Ranking depends on) before a
 * response can be assembled. "excluded" removes Ranking from the path
 * entirely — queries are served with base relevance ordering (whatever
 * Index Cluster A/B themselves rank by) and no personalization/
 * re-ranking. This is the dominant, business-sanctioned degradation: the
 * briefing states advanced ranking is optional during an incident, so
 * "excluded" is never itself unsafe — it only becomes a problem if
 * paired with an unsafe PARTIAL_RESULT_MODE_KEY (see below).
 */
export const RANKING_INCLUSION_KEY = "rankingInclusionMode";

/**
 * How long the Query Coordinator will wait for a Ranking Service
 * response before giving up on that one call. The incident default
 * (5000ms) is long enough that, once Ranking is genuinely slow, the
 * Coordinator holds its connections to Index Cluster A/B and the
 * Feature Store open for the full wait — this is the direct mechanical
 * cause of the downstream connection pressure. Lowering it fails the
 * ranking call fast (falling back to base relevance for that query)
 * without excluding ranking altogether, but still requires
 * RANKING_INCLUSION_KEY/PARTIAL_RESULT_MODE_KEY to be configured so that
 * timeout actually resolves into a safe fallback instead of an error.
 */
export const RANKING_TIMEOUT_MS_KEY = "rankingTimeoutMs";

/**
 * How aggressively the Ranking Service's own calls into the Feature
 * Store are made. "full" (default) fetches the complete feature set for
 * every query. "reduced" fetches a smaller, cheaper feature subset
 * (coarser personalization, much lower Feature Store QPS). "off" skips
 * feature enrichment altogether — only meaningful once ranking is
 * already excluded/degraded, since a live Ranking Service with no
 * features to score against produces meaningless re-ranking.
 */
export const FEATURE_STORE_USAGE_KEY = "featureStoreUsageMode";

/**
 * Query Coordinator's own per-query concurrency ceiling. Raising this
 * (200 or 400) is the API-layer instinct to "add capacity" at the tier
 * that looks like the bottleneck from a client's point of view — but
 * every additional concurrent query the Coordinator is allowed to accept
 * is ANOTHER query that will sit waiting on the slow Ranking Service,
 * holding its own Index Cluster A/B connections and Feature Store call
 * open for the same long duration. Raising this alone, while Ranking is
 * still degraded and still in the path, measurably worsens index/
 * feature-store pressure rather than relieving anything — the named
 * pressure-transfer trap (see rules.ts for real authored numbers).
 */
export const QUERY_CONCURRENCY_KEY = "queryConcurrencyLimit";

/**
 * Whether the Query Coordinator may return a response that does not wait
 * on every planned downstream call. "off" (default) assembles a response
 * only once every call it issued has returned or timed out. "on" lets
 * the Coordinator return whatever Index Cluster A/B have already
 * produced once a bounded wait elapses, without blocking further on
 * Ranking/Feature Store. This is the mechanism that actually lets
 * excluding/timing-out Ranking translate into fast, healthy responses
 * instead of merely swapping one wait for another — but it is also the
 * one control whose misuse can create a genuine correctness violation:
 * see CACHE_KEY below and rules.ts's staleOrUnrelatedResultsServedCount
 * for the historical-damage mechanism this gates.
 */
export const PARTIAL_RESULT_MODE_KEY = "partialResultMode";

/**
 * Query-result cache in front of Index Cluster A/B, scoped and
 * freshness-bounded to the allowed staleness window the business
 * invariant permits. "off" (default) serves every query live. "on"
 * serves cache hits for recently-seen identical queries, cutting
 * duplicate load on the index clusters during the concurrency spike —
 * but ONLY ever serves entries within the authored freshness bound; it
 * is never the source of stale/unrelated content on its own. (The
 * correctness risk lives in PARTIAL_RESULT_MODE_KEY paired with ranking
 * excluded and this cache left off — see rules.ts.)
 */
export const CACHE_KEY = "queryResultCacheMode";

/**
 * Per-call timeout the Query Coordinator applies to Index Cluster A/B
 * themselves. The index clusters are healthy throughout this incident —
 * their own serving latency never rises above 35-37ms, so tightening
 * this to 1,200ms does not address the Ranking-driven pressure and is a
 * largely neutral lever under normal load, present so a candidate can
 * verify index latency is NOT the problem rather than guess. It stops
 * being neutral, however, once the pressure-transfer trap
 * (QUERY_CONCURRENCY_KEY/API_CAPACITY_KEY both raised while Ranking is
 * still in the path) has already driven the Coordinator's own
 * connection pool into saturation: queries now queue, waiting for a
 * connection slot, before the index call is even issued. Tightening the
 * index timeout in that state does not give the index clusters any more
 * trouble (their 35-37ms service time never changes) — it clips calls
 * that were queued long enough that the tighter budget elapses before
 * the index call can even be issued, turning queued-but-recoverable
 * queries into outright failures. See rules.ts
 * "index-timeout-tightened-during-pressure-transfer".
 */
export const INDEX_TIMEOUT_MS_KEY = "indexTimeoutMs";

/**
 * Search API's own horizontal capacity. Like QUERY_CONCURRENCY_KEY, this
 * is the other "just add capacity at the edge" instinct — more Search
 * API instances accept more inbound requests and forward proportionally
 * more concurrent queries into the same Query Coordinator, which is
 * still waiting on the same degraded Ranking Service. Raised alone, it
 * compounds QUERY_CONCURRENCY_KEY's own pressure-transfer effect rather
 * than curing anything.
 */
export const API_CAPACITY_KEY = "apiCapacityUnits";

export const controls: ControlDefinition[] = [
  {
    key: RANKING_INCLUSION_KEY,
    allowedValues: ["included", "excluded"],
    initialValue: "included",
  },
  {
    key: RANKING_TIMEOUT_MS_KEY,
    allowedValues: [5_000, 1_500, 400],
    initialValue: 5_000,
  },
  {
    key: FEATURE_STORE_USAGE_KEY,
    allowedValues: ["full", "reduced", "off"],
    initialValue: "full",
  },
  {
    key: QUERY_CONCURRENCY_KEY,
    allowedValues: [100, 200, 400],
    initialValue: 100,
  },
  {
    key: PARTIAL_RESULT_MODE_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: CACHE_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: INDEX_TIMEOUT_MS_KEY,
    allowedValues: [3_000, 1_200],
    initialValue: 3_000,
  },
  {
    key: API_CAPACITY_KEY,
    allowedValues: [100, 200, 400],
    initialValue: 100,
  },
];
