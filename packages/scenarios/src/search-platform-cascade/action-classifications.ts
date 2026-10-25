import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_CAPACITY_KEY,
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  PARTIAL_RESULT_MODE_KEY,
  QUERY_CONCURRENCY_KEY,
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` describing the system consequence. Ids are
 * stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: QUERY_CONCURRENCY_KEY,
    valueAtLeast: 200,
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Raised query concurrency while Ranking stayed in the path",
      explanation:
        "Raising the Query Coordinator's concurrency limit while Ranking is still included and still degraded admits more concurrent queries, every one of which also waits the same long Ranking timeout. Index Cluster A and Index Cluster B connection counts and Feature Store QPS went up, not down, and Search API p99 latency got worse — the pressure moved from 'symptom' to 'more symptom,' because the root wait was never actually shortened.",
    },
  },
  {
    id: "acr_2",
    controlKey: API_CAPACITY_KEY,
    valueAtLeast: 200,
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled Search API capacity while Ranking stayed in the path",
      explanation:
        "Adding Search API capacity accepts more inbound requests and forwards proportionally more concurrent queries into the same Query Coordinator, which is still waiting on the same degraded Ranking Service. Combined with Query Coordinator concurrency, this compounds the held-connection pressure on Index Cluster A/B and the Feature Store rather than relieving it — scaling the edge never touches the root cause sitting one hop downstream.",
    },
  },
  {
    id: "acr_3",
    controlKey: RANKING_INCLUSION_KEY,
    valueEquals: "excluded",
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Excluded Ranking from the query path",
      explanation:
        "Removing Ranking from the path stops the Query Coordinator from holding Index Cluster A/B connections and Feature Store calls open waiting on it. Basic search results are served immediately using base relevance ordering — the business invariant explicitly allows this, since advanced ranking is optional during an incident. This alone does not yet drain the connection pressure already built up; that takes real elapsed time.",
    },
  },
  {
    id: "acr_4",
    controlKey: PARTIAL_RESULT_MODE_KEY,
    valueEquals: "on",
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Enabled partial-result mode",
      explanation:
        "Letting the Query Coordinator respond without waiting on every planned downstream call is what actually lets excluding/timing-out Ranking translate into fast responses. On its own this is neutral — whether it is safe depends entirely on whether the query-result cache is also engaged. Without a bounded cache fallback, partial-result mode can serve stale or unrelated content outside the allowed correctness bound; with the cache on, it is a safe, bounded fallback.",
    },
  },
  {
    id: "acr_5",
    controlKey: CACHE_KEY,
    valueEquals: "off",
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Left the query-result cache off while using partial-result mode",
      explanation:
        "With partial-result mode on and the cache off, the Query Coordinator has no bounded, freshness-respecting fallback to serve when a query can't wait for every downstream call — it returns stale or unrelated content outside the allowed correctness bound instead. This directly incremented staleOrUnrelatedResultsServedCount, a historical correctness violation that does not undo itself once the configuration is later fixed: every response already served this way stays served.",
    },
  },
  {
    id: "acr_6",
    controlKey: CACHE_KEY,
    valueEquals: "on",
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Enabled the bounded query-result cache",
      explanation:
        "Engaging the query-result cache gives partial-result mode a genuine, freshness-bounded fallback to serve from instead of falling back to stale/unrelated content. This halts further growth of staleOrUnrelatedResultsServedCount — but it does not retroactively un-serve whatever was already returned outside the bound before the cache was turned on; that historical count remains part of the record.",
    },
  },
  {
    id: "acr_7",
    controlKey: FEATURE_STORE_USAGE_KEY,
    valueEquals: "reduced",
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced Feature Store usage",
      explanation:
        "Fetching a smaller feature subset per query lowers Feature Store QPS directly — genuine, real relief on one of the three downstream pressure points. It does nothing for the Query Coordinator's own held connections to Index Cluster A/B, which stay elevated until Ranking itself is taken out of the hot path.",
    },
  },
  {
    id: "acr_8",
    controlKey: RANKING_TIMEOUT_MS_KEY,
    valueAtMost: 400,
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Shortened the Ranking Service timeout",
      explanation:
        "Shortening how long the Coordinator waits on Ranking before giving up bounds the worst of the hold-open behavior per query, giving real but partial relief. Every query still waits some amount on Ranking before responding, so index-cluster connection pressure and Feature Store QPS stay meaningfully elevated versus fully excluding Ranking from the path.",
    },
  },
  {
    id: "acr_9",
    controlKey: RANKING_INCLUSION_KEY,
    valueEquals: "included",
    whenTriggerEquals: { rankingDegraded: true, coordinatorDrainWindowElapsed: false },
    outcome: "harmful",
    feedback: {
      title: "Restored Ranking before the coordinator had drained",
      explanation:
        "Index Cluster A/B connection pressure and Feature Store QPS take real elapsed time to drain once Ranking is taken out of the hot path — restoring Ranking before that drain window has actually elapsed re-exposes the Coordinator's connection pool to the same long Ranking wait under load that never actually recovered, immediately re-spiking the exact pressure this incident exists to relieve. The same final control value is safe once drained and unsafe before.",
    },
  },
  {
    id: "acr_10",
    controlKey: RANKING_INCLUSION_KEY,
    valueEquals: "included",
    whenTriggerEquals: { rankingDegraded: true, coordinatorDrainWindowElapsed: true },
    outcome: "beneficial",
    feedback: {
      title: "Restored Ranking after the coordinator had drained",
      explanation:
        "With Index Cluster A/B connection pressure and Feature Store QPS already genuinely drained back to baseline, restoring Ranking to the query path is safe — the Coordinator resumes waiting on Ranking under load levels that have real headroom again, rather than load that is still recovering.",
    },
  },
  {
    id: "acr_11",
    controlKey: INDEX_TIMEOUT_MS_KEY,
    valueAtMost: 1_200,
    whenTriggerEquals: { rankingDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Tightened the Index Cluster per-call timeout",
      explanation:
        "Index Cluster A and Index Cluster B are healthy throughout this incident — their own serving latency never rises above 35-37ms, so tightening this timeout confirms the index clusters are not the bottleneck rather than fixing anything. On its own, with query concurrency and API capacity still at safe levels, this stays neutral. But if query concurrency and API capacity have ALSO been raised to try to push through the Ranking latency, the Coordinator's connection pool is saturated enough that queries queue for a free slot before the index call is even issued — the tighter budget then clips otherwise-recoverable queued calls into outright failures, making basic search availability worse, not better.",
    },
  },
];
