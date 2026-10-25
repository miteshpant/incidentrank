import type { ControlDefinition } from "@incidentrank/simulator";

/** The real fix: project the response down to only the fields the
 * caller actually needs instead of returning the newly expanded full
 * nested objects. This directly shrinks the amount of data serialized
 * and transferred per request — the per-request cost itself goes down,
 * not merely the number of requests that can be absorbed. */
export const RESPONSE_PROJECTION_ENABLED_KEY = "responseProjectionEnabled";

/** Rows of nested detail returned per page. A smaller page means each
 * response carries less expanded data — a genuine, real reduction in
 * per-request serialization/bandwidth cost, though a partial one: the
 * newly expanded shape is still being returned in full for every row
 * that IS included. */
export const PAGE_SIZE_KEY = "pageSize";

/** Response-body compression. Reduces bytes actually transferred over
 * the wire (network utilization, and the portion of tail latency caused
 * by transfer time), but does nothing about how much work the API tier
 * does building the oversized object graph in memory before compressing
 * it — serialization cost and memory pressure stay exactly as elevated
 * as before. A genuine, real, but partial/different-mechanism
 * mitigation. */
export const COMPRESSION_ENABLED_KEY = "compressionEnabled";

/** A hard ceiling on response body size; responses that would exceed it
 * are truncated before being returned to the caller. This caps
 * bandwidth and memory for the oversized responses, but a truncated
 * response is missing data the caller asked for — silently returning
 * incomplete data is a correctness problem, not a capacity one, unless
 * the caller is told the response was truncated. */
export const PAYLOAD_SIZE_LIMIT_KEY = "payloadSizeLimit";

/** API-tier horizontal scaling. Per the scenario's binding design
 * requirement, raising this reduces how much memory pressure any ONE
 * instance carries (each instance now serializes a smaller share of
 * total concurrent requests), but every individual request is still
 * exactly as large and exactly as expensive to serialize and transfer —
 * payload size, serialization cost, and per-request bandwidth stay
 * unchanged regardless of this control's value. */
export const API_INSTANCE_COUNT_KEY = "apiInstanceCount";

/** Caches the fully serialized response body for repeat identical
 * requests. A cache HIT skips re-serialization and re-transfer entirely
 * — genuine relief — but a cache MISS (including every first request for
 * a given key, and the unavoidable churn of highly variable per-account
 * data) still has to build and transfer the full oversized response,
 * and caching large bodies itself consumes more cache memory than
 * before the regression. */
export const RESPONSE_CACHE_ENABLED_KEY = "responseCacheEnabled";

export const controls: ControlDefinition[] = [
  {
    key: RESPONSE_PROJECTION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: PAGE_SIZE_KEY,
    allowedValues: [500, 100, 25],
    initialValue: 500,
  },
  {
    key: COMPRESSION_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: PAYLOAD_SIZE_LIMIT_KEY,
    allowedValues: ["unlimited", "512kb", "128kb"],
    initialValue: "unlimited",
  },
  {
    key: API_INSTANCE_COUNT_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 4,
  },
  {
    key: RESPONSE_CACHE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
