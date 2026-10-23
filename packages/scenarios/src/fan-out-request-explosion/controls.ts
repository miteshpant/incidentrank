import type { ControlDefinition } from "@incidentrank/simulator";

/** How many of the five downstream calls the aggregator is allowed to run
 * concurrently per inbound request. Raising this while Service E is
 * degraded does not relieve pressure — it increases the rate at which new
 * requests pile onto an already-saturated Service E, and also raises
 * concurrent load on Service A (pricing), which has its own bounded
 * capacity shared across the whole fleet. */
export const FAN_OUT_CONCURRENCY_LIMIT_KEY = "fanOutConcurrencyLimit";

/** Excludes the optional recommendation-enrichment call (Service E) from
 * the aggregator's fan-out entirely. The product response remains
 * complete and correct without it — pricing, inventory, shipping, and tax
 * are untouched. */
export const ENRICHMENT_CALL_ENABLED_KEY = "enrichmentCallEnabled";

/** Whether the aggregator may return a response as soon as every CORE
 * dependency (A-D) has answered, tolerating a missing/failed optional
 * call, versus waiting on and failing the whole request if any one of the
 * five calls fails or times out. */
export const PARTIAL_RESPONSE_POLICY_KEY = "partialResponsePolicy";

/** A short-TTL cache in front of Service E's recommendation responses.
 * Shields Service E from repeat identical lookups, but a cold cache under
 * live load still has to make the real call to the already-degraded
 * service to fill. */
export const RESPONSE_CACHE_ENABLED_KEY = "responseCacheEnabled";

/** Batches multiple product lookups bound for the same downstream service
 * into fewer physical calls, reducing downstream QPS broadly across all
 * five services rather than targeting Service E specifically. */
export const REQUEST_BATCHING_ENABLED_KEY = "requestBatchingEnabled";

/** The timeout the aggregator applies specifically to the Service E call.
 * A long timeout holds the aggregator thread (and its slot in the
 * concurrency limit) open for the full duration of Service E's degraded
 * response time; an aggressively short timeout fails the enrichment call
 * quickly but produces a higher partial-response rate if partial
 * responses aren't allowed. */
export const SERVICE_E_TIMEOUT_MS_KEY = "serviceETimeoutMs";

export const controls: ControlDefinition[] = [
  {
    key: FAN_OUT_CONCURRENCY_LIMIT_KEY,
    allowedValues: [20, 50, 100, 200],
    initialValue: 50,
  },
  {
    key: ENRICHMENT_CALL_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: true,
  },
  {
    key: PARTIAL_RESPONSE_POLICY_KEY,
    allowedValues: ["failWhole", "partialAllowed"],
    initialValue: "failWhole",
  },
  {
    key: RESPONSE_CACHE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REQUEST_BATCHING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: SERVICE_E_TIMEOUT_MS_KEY,
    allowedValues: [3_000, 1_000, 300],
    initialValue: 3_000,
  },
];
