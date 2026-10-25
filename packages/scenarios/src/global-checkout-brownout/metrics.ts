import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // End-to-end checkout latency, in milliseconds, as observed by
  // Web/Mobile. The composite signal: no single dependency's latency
  // alone explains this number once Pricing/Promotions/Tax are all
  // moderately slow at once -- it is the SUM of whichever dependency
  // calls remain on the synchronous critical path.
  checkoutLatencyMs: 800,
  // Per-dependency latency, ms. Individually "moderate" during the
  // incident (each well under what would trip an isolated-outage
  // definition) -- the point of the scenario is that none of these looks
  // like an outage in isolation.
  pricingLatencyMs: 150,
  inventoryLatencyMs: 120,
  promotionsLatencyMs: 130,
  taxLatencyMs: 110,
  paymentLatencyMs: 180,
  // Per-dependency error rate, percent. Elevated-but-survivable during
  // the incident for the three degraded dependencies; Inventory/Payment
  // stay at their healthy baseline unless retry/concurrency pressure is
  // transferred onto them.
  pricingErrorRatePct: 1,
  inventoryErrorRatePct: 1,
  promotionsErrorRatePct: 1,
  taxErrorRatePct: 1,
  paymentErrorRatePct: 1,
  // Concurrent in-flight checkout requests currently being held open by
  // the orchestrator, waiting on at least one synchronous dependency
  // call.
  requestConcurrency: 40,
  // Percent of completed checkouts that returned reduced
  // enrichment/skipped promotions/used a fallback rather than the full
  // live path -- a candidate-visible signal of HOW checkout is
  // succeeding, not just whether it is.
  partialCheckoutPct: 0,
  // THE correctness fields. 100 is the only acceptable floor for both --
  // the business invariant is that payment authorization and inventory
  // reservation must remain correct regardless of load. These must never
  // be sacrificed to relieve latency/error pressure elsewhere.
  paymentAuthSuccessPct: 100,
  inventoryReservationSuccessPct: 100,
  // Count of inventory reservations made optimistically (i.e. without a
  // confirmed atomic hold) that have not yet been reconciled -- the
  // direct, observable evidence of correctness risk when
  // inventoryReservationStrategy is "optimistic" under load. Zero is the
  // only safe value; nonzero means a real oversell risk currently exists.
  unreconciledOptimisticReservationCount: 0,
  // Severity field (exactly normal|warning|critical) summarizing the
  // orchestrator's own assessment of synchronous-critical-path health --
  // distinct from any single dependency's latency/error numbers.
  checkoutPathStatus: "normal",
  // Generic string-state field recording the DOMINANT mechanism currently
  // keeping (or failing to keep) checkout usable -- read only by
  // scoring's reliability-adjacent measure, never by engine resolution
  // logic. "critical-path-trimmed" = non-critical dependencies removed
  // from the synchronous path while correctness-critical ones (Payment,
  // Inventory) stay fully live. "retry-amplified" = retries/concurrency
  // were increased instead, pushing pressure onto dependencies rather
  // than relieving it. "unresolved" = no deliberate mitigation has
  // engaged yet.
  checkoutMitigationMode: "unresolved",
  // Requests still in flight and decaying after a load-shedding/critical-
  // path-trimming mitigation is applied -- the recovery-lag signal. Does
  // not drop to zero instantly: in-flight requests admitted under the
  // prior, heavier concurrency/retry load must drain first.
  inFlightDrainingRequests: 0,
};
