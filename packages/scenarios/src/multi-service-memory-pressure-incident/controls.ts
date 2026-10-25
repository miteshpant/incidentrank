import type { ControlDefinition } from "@incidentrank/simulator";

/**
 * The response field set the Aggregator requests from and assembles out
 * of all three dependencies, per request. "full" (default, root-cause
 * state) is the newly-shipped shape: every dependency's complete nested
 * object is pulled and held in memory before projection. "reduced"
 * truncates to the explicit correctness-bounded field set the response
 * actually needs — a genuine root-cause fix, since it shrinks the
 * object the Aggregator builds and holds, not merely what is shown to a
 * caller after the fact.
 */
export const RESPONSE_FIELD_SET_MODE_KEY = "responseFieldSetMode";

/**
 * How many aggregation jobs the Aggregator runs concurrently. Lowering
 * this reduces how many oversized per-request aggregation objects exist
 * in memory AT ONCE — a genuine, structurally different root-cause fix
 * from responseFieldSetMode (it does not shrink any single object, it
 * shrinks how many are held simultaneously). Raising it (or leaving it
 * at the default) does the opposite: more oversized objects alive
 * concurrently, independent of which dependency is currently the loudest
 * symptom.
 */
export const AGGREGATION_CONCURRENCY_KEY = "aggregationConcurrency";

/**
 * A hard cap on the Aggregator's own response size, enforced AFTER
 * aggregation has already happened. Looks like it fixes memory pressure
 * (the thing sent over the wire shrinks), but it is a post-hoc truncation
 * of an already-built oversized object, not a reduction of what the
 * Aggregator actually builds and holds — and at the tightest setting it
 * truncates past the explicit correctness bound (enrichment fields the
 * response is contractually required to carry), producing visible
 * customer-facing correctness damage rather than a capacity fix.
 */
export const MAX_RESPONSE_SIZE_KEY = "maxResponseSizeKb";

/**
 * API Service-tier request concurrency. Scaling this up lets more
 * inbound requests be admitted at once, each of which still drives the
 * same oversized Aggregator work — more concurrent demand on an
 * unfixed root cause, not a fix for it.
 */
export const API_CONCURRENCY_KEY = "apiConcurrency";

/**
 * Dependency A's own instance count — the tempting decoy lever. Scaling
 * the FIRST service to visibly GC-thrash gives it more aggregate heap
 * headroom and provides real, measurable, but temporary relief, because
 * nothing about the Aggregator's oversized per-request object has
 * changed. Memory pressure both persists (Dependency A re-accumulates
 * pressure once request volume continues) and transfers (Dependency B
 * and C, which were never scaled, absorb a larger relative share of the
 * same unaddressed upstream amplification).
 */
export const DEPENDENCY_A_INSTANCE_COUNT_KEY = "dependencyAInstanceCount";

/**
 * Caches the Aggregator's assembled response for a short window.
 * Genuinely reduces how often the full oversized aggregation has to be
 * rebuilt for repeat identical requests, but the enrichment payload is
 * highly per-request/per-account variable, so the cache hit rate stays
 * low under live load — real but incomplete relief, never a full fix on
 * its own.
 */
export const CACHE_POLICY_KEY = "cachePolicy";

/**
 * The Aggregator's own worker pool size. Raising this scales the ROOT
 * LOCATION (the Aggregator process itself) without changing what each
 * worker actually has to build and hold — this is the scenario's
 * required design property: "scaling a symptom service is not a durable
 * fix if upstream amplification remains active" extends to scaling the
 * Aggregator's own workers, which still each build the same oversized
 * object per request.
 */
export const WORKER_COUNT_KEY = "workerCount";

/**
 * Whether the Aggregator may return a response once a correctness-
 * bounded core subset of enrichment has been assembled, tolerating
 * slower/missing optional enrichment from whichever dependency is
 * currently under pressure, versus waiting on and holding memory for
 * every dependency's full result before responding at all.
 */
export const PARTIAL_RESPONSE_MODE_KEY = "partialResponseMode";

export const controls: ControlDefinition[] = [
  {
    key: RESPONSE_FIELD_SET_MODE_KEY,
    allowedValues: ["full", "reduced"],
    initialValue: "full",
  },
  {
    key: AGGREGATION_CONCURRENCY_KEY,
    allowedValues: [50, 25, 10],
    initialValue: 50,
  },
  {
    key: MAX_RESPONSE_SIZE_KEY,
    allowedValues: ["unlimited", "256kb", "64kb"],
    initialValue: "unlimited",
  },
  {
    key: API_CONCURRENCY_KEY,
    allowedValues: [100, 200, 400],
    initialValue: 100,
  },
  {
    key: DEPENDENCY_A_INSTANCE_COUNT_KEY,
    allowedValues: [2, 4, 8],
    initialValue: 2,
  },
  {
    key: CACHE_POLICY_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: WORKER_COUNT_KEY,
    allowedValues: [8, 16, 32],
    initialValue: 8,
  },
  {
    key: PARTIAL_RESPONSE_MODE_KEY,
    allowedValues: ["disabled", "enabled"],
    initialValue: "disabled",
  },
];
