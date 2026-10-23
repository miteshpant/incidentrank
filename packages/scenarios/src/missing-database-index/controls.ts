import type { ControlDefinition } from "@incidentrank/simulator";

/** The real database-side correction: adds the missing index backing the
 * recently deployed order-history query path, letting lookups seek
 * directly to the relevant rows instead of scanning the whole table. */
export const TARGETED_INDEX_ENABLED_KEY = "targetedIndexEnabled";

/** API-layer horizontal scaling. Per the scenario's design requirement,
 * raising this while the index is still missing increases the number of
 * concurrent full-table-scan queries hitting Postgres, worsening DB CPU
 * and lock pressure rather than relieving it. */
export const API_INSTANCE_COUNT_KEY = "apiInstanceCount";

/** Postgres connection pool ceiling. Raising this lets more scanning
 * queries run concurrently rather than queueing at the pool boundary —
 * it widens the pipe into an already-overloaded primary, it does not
 * shrink the work each query does. */
export const DB_CONNECTION_POOL_SIZE_KEY = "dbConnectionPoolSize";

/** Temporarily disables the specific order-history endpoint driving the
 * scans, trading that one feature's availability for immediate relief
 * everywhere else. */
export const ORDER_HISTORY_ENDPOINT_ENABLED_KEY = "orderHistoryEndpointEnabled";

/** Rows requested per order-history page. A smaller page means each scan
 * does less work per request — a genuine partial mitigation — but every
 * request is still a full-table scan; it does not remove the underlying
 * missing index. */
export const QUERY_PAGE_SIZE_KEY = "queryPageSize";

/** Temporary read-through cache in front of the order-history query
 * path. Shields Postgres from repeat identical lookups, but a cold cache
 * (e.g. right after enabling it under live load) must still fill via the
 * same uncached, unindexed scan path. */
export const TEMPORARY_CACHE_ENABLED_KEY = "temporaryCacheEnabled";

export const controls: ControlDefinition[] = [
  {
    key: TARGETED_INDEX_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: API_INSTANCE_COUNT_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: DB_CONNECTION_POOL_SIZE_KEY,
    allowedValues: [20, 50, 100, 200],
    initialValue: 20,
  },
  {
    key: ORDER_HISTORY_ENDPOINT_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: true,
  },
  {
    key: QUERY_PAGE_SIZE_KEY,
    allowedValues: [500, 100, 25],
    initialValue: 500,
  },
  {
    key: TEMPORARY_CACHE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
