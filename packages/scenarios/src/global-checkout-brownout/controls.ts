import type { ControlDefinition } from "@incidentrank/simulator";

/** Promotions are explicitly, business-sanctioned-degradable (see the
 * briefing's business invariant). "enabled" keeps promo-code evaluation on
 * the synchronous checkout path; "disabled" removes it from the path
 * entirely for the duration of the incident. */
export const PROMOTIONS_MODE_KEY = "promotionsMode";

/** "live" calls the Tax service synchronously for exact tax calculation.
 * "bounded-fallback" uses a pre-computed, slightly conservative tax-rate
 * table instead of calling the degraded Tax service — the business has
 * explicitly authorized this as an acceptable bounded approximation
 * during an incident (see the briefing). */
export const TAX_MODE_KEY = "taxMode";

/** "live" calls Pricing synchronously for authoritative, up-to-the-second
 * pricing. "cached-fallback" serves the last-known-good price from a
 * short-TTL cache instead of waiting on the degraded Pricing service. */
export const PRICING_MODE_KEY = "pricingMode";

/** Optional post-payment/order enrichment (loyalty-points preview,
 * related-item recommendations) rendered on the confirmation step.
 * "full" keeps it on the synchronous critical path; "reduced" removes it
 * from the synchronous path (deferred/omitted), shortening checkout
 * latency with zero correctness cost since enrichment never touches
 * payment or inventory. */
export const ENRICHMENT_MODE_KEY = "enrichmentMode";

/** Per-dependency-call timeout budget, in milliseconds, applied uniformly
 * to every synchronous call the Checkout Orchestrator makes. A tighter
 * budget fails a slow call faster (freeing the request thread sooner) at
 * the cost of a higher raw per-call timeout-error rate; a looser budget
 * tolerates more latency per call but lets a slow dependency hold the
 * whole synchronous chain open longer. */
export const TIMEOUT_BUDGET_MS_KEY = "timeoutBudgetMs";

/** Global retry policy applied uniformly across every synchronous
 * dependency call (Cart/Pricing/Inventory/Promotions/Tax/Payment) made by
 * the Checkout Orchestrator — a single shared lever, not configured per
 * dependency. "none" issues exactly one attempt per call. "moderate"
 * retries a failed/timed-out call once. "aggressive" retries up to three
 * times. This is the scenario's required pressure-transfer / harmful
 * lever (phase6dsupport.md): increasing retries uniformly across every
 * already-moderately-degraded dependency multiplies the concurrent
 * request volume each of those dependencies must absorb, pushing
 * services that were merely slow into outright overload. */
export const RETRY_POLICY_KEY = "retryPolicy";

/** Maximum number of checkout requests the orchestrator will admit
 * concurrently; requests beyond this are queued/shed rather than
 * admitted. A higher ceiling admits more concurrent requests onto the
 * same synchronous critical path, amplifying load on every downstream
 * dependency simultaneously -- it does not make any individual dependency
 * call faster. */
export const MAX_CHECKOUT_CONCURRENCY_KEY = "maxCheckoutConcurrency";

/** Inventory reservation correctness strategy. "strict" always confirms a
 * real, atomic reservation before authorizing payment -- the only mode
 * that can never oversell. "optimistic" assumes availability and
 * reconciles after the fact, trading inventory correctness for lower
 * latency -- never an acceptable tradeoff per the business invariant that
 * inventory reservation must remain correct, regardless of load. */
export const INVENTORY_RESERVATION_STRATEGY_KEY = "inventoryReservationStrategy";

export const controls: ControlDefinition[] = [
  {
    key: PROMOTIONS_MODE_KEY,
    allowedValues: ["enabled", "disabled"],
    initialValue: "enabled",
  },
  {
    key: TAX_MODE_KEY,
    allowedValues: ["live", "bounded-fallback"],
    initialValue: "live",
  },
  {
    key: PRICING_MODE_KEY,
    allowedValues: ["live", "cached-fallback"],
    initialValue: "live",
  },
  {
    key: ENRICHMENT_MODE_KEY,
    allowedValues: ["full", "reduced"],
    initialValue: "full",
  },
  {
    key: TIMEOUT_BUDGET_MS_KEY,
    allowedValues: [2_000, 4_000, 8_000],
    initialValue: 4_000,
  },
  {
    key: RETRY_POLICY_KEY,
    allowedValues: ["none", "moderate", "aggressive"],
    initialValue: "none",
  },
  {
    key: MAX_CHECKOUT_CONCURRENCY_KEY,
    allowedValues: [50, 100, 200],
    initialValue: 100,
  },
  {
    key: INVENTORY_RESERVATION_STRATEGY_KEY,
    allowedValues: ["strict", "optimistic"],
    initialValue: "strict",
  },
];
