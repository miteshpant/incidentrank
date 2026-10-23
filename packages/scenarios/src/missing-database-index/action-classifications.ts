import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  DB_CONNECTION_POOL_SIZE_KEY,
  ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
  QUERY_PAGE_SIZE_KEY,
  TARGETED_INDEX_ENABLED_KEY,
  TEMPORARY_CACHE_ENABLED_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per Phase 6B's mandatory post-incident-feedback requirement
 * (docs/implementation_plan/phase6b.md section 13). Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: TARGETED_INDEX_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { trafficRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Added the missing index",
      explanation:
        "Adding the index let the order-history query seek directly to the relevant rows instead of scanning the whole table. Scanned rows, DB CPU, and query latency all dropped immediately, and the recovery held regardless of how traffic continued to grow — this is the one change that addresses the actual cause rather than its symptoms.",
    },
  },
  {
    id: "acr_2",
    controlKey: API_INSTANCE_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { trafficRising: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that wasn't the bottleneck",
      explanation:
        "The order-history query was still performing a full-table scan. Adding API instances let more requests start concurrently, but each one ran the same expensive scan against the same primary — so DB CPU and lock pressure increased rather than easing, even though the API layer itself had more headroom to accept traffic.",
    },
  },
  {
    id: "acr_3",
    controlKey: DB_CONNECTION_POOL_SIZE_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { trafficRising: true },
    outcome: "harmful",
    feedback: {
      title: "Widened the pipe into an overloaded database",
      explanation:
        "Raising the connection pool ceiling let more full-table-scan queries run at once instead of queueing for a connection. That moved the bottleneck deeper into Postgres itself — DB CPU climbed further — rather than reducing the amount of work each query had to do.",
    },
  },
  {
    id: "acr_4",
    controlKey: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { trafficRising: true },
    outcome: "neutral",
    feedback: {
      title: "Removed the load by removing the feature",
      explanation:
        "Disabling the order-history endpoint stopped the scans entirely and every metric recovered, but the order-history feature itself was unavailable to customers for as long as it stayed off. This is a legitimate way to stabilize the platform under pressure, but it trades away functionality rather than fixing the underlying missing index.",
    },
  },
  {
    id: "acr_5",
    controlKey: QUERY_PAGE_SIZE_KEY,
    valueAtMost: 100,
    whenTriggerEquals: { trafficRising: true },
    outcome: "neutral",
    feedback: {
      title: "Reduced the cost of each scan without removing it",
      explanation:
        "A smaller page size reduces how much row data each query has to copy back, giving some relief. But every request was still a full-table scan at full table cardinality — the underlying cause remained, so DB CPU stayed elevated even though it improved from baseline.",
    },
  },
  {
    id: "acr_6",
    controlKey: TEMPORARY_CACHE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { trafficRising: true },
    outcome: "neutral",
    feedback: {
      title: "Cached the result, not the fix",
      explanation:
        "A read-through cache can absorb repeat identical lookups, but every cache miss — including the initial fill under live load — still has to run the same unindexed full-table scan. The cache reduced pressure without removing the structural cause.",
    },
  },
];
