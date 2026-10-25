import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  ENRICHMENT_MODE_KEY,
  INVENTORY_RESERVATION_STRATEGY_KEY,
  MAX_CHECKOUT_CONCURRENCY_KEY,
  PRICING_MODE_KEY,
  PROMOTIONS_MODE_KEY,
  RETRY_POLICY_KEY,
  TAX_MODE_KEY,
  TIMEOUT_BUDGET_MS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "web-mobile": "healthy",
  "checkout-orchestrator": "healthy",
  cart: "healthy",
  pricing: "healthy",
  inventory: "healthy",
  promotions: "healthy",
  tax: "healthy",
  payment: "healthy",
  "order-service": "healthy",
};

// Pricing/Promotions/Tax moderately degraded, nothing isolated from the
// synchronous path, no retry/concurrency amplification.
const baselineDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  pricing: "degraded",
  promotions: "degraded",
  tax: "degraded",
};

// Same three degraded, plus retry/concurrency amplification pushing
// Payment and Inventory into visible trouble too -- the pressure-transfer
// consequence.
const amplifiedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  pricing: "critical",
  promotions: "critical",
  tax: "critical",
  payment: "degraded",
  inventory: "degraded",
};

const fullyAmplifiedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  pricing: "critical",
  promotions: "critical",
  tax: "critical",
  payment: "critical",
  inventory: "critical",
};

// Critical path trimmed correctly: Promotions/Tax/Pricing off the
// synchronous path (or using fallbacks), Payment/Inventory/Cart untouched
// and healthy throughout.
const trimmedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  promotions: "healthy",
  tax: "degraded",
  pricing: "degraded",
};

// Inventory correctness trap engaged: strategy is optimistic while load is
// elevated -- Inventory LOOKS fine (fast, low latency) but is silently
// accumulating unreconciled reservations.
const optimisticTrapHealth: Record<string, ComponentHealth> = {
  ...baselineDegradedHealth,
  inventory: "healthy",
};

/**
 * Authored rule table for Global Checkout Brownout, ordered most-specific
 * first.
 *
 * Business invariants (stated in the candidate briefing, see
 * global-checkout-brownout.ts): payment authorization and inventory
 * reservation must remain correct at all times -- paymentAuthSuccessPct
 * and inventoryReservationSuccessPct must never be sacrificed to relieve
 * latency elsewhere, and unreconciledOptimisticReservationCount must stay
 * at zero. Promotions may be disabled outright. Tax may use the
 * business-authorized bounded fallback. Pricing may serve a short-TTL
 * cached fallback instead of a live call. Checkout may return reduced
 * enrichment (or a visible partial-checkout state) rather than fail
 * end-to-end.
 *
 * The root mechanism: Pricing, Promotions, and Tax are each only
 * MODERATELY degraded (dependenciesDegraded=true) -- none individually
 * looks like an outage. checkoutLatencyMs is authored as the composite
 * of whichever dependency calls remain on the synchronous critical path;
 * with all three slow calls still on that path, the total crosses the
 * usability threshold even though every per-dependency latency number
 * individually looks "survivable." The fix is removing non-critical calls
 * from the synchronous path (PROMOTIONS_MODE_KEY=disabled,
 * TAX_MODE_KEY=bounded-fallback, PRICING_MODE_KEY=cached-fallback,
 * ENRICHMENT_MODE_KEY=reduced), never fixing/isolating a single "broken"
 * dependency, because there isn't one.
 *
 * RETRY_POLICY_KEY is the required pressure-transfer / harmful lever
 * (phase6dsupport.md section 13): it applies UNIFORMLY across every
 * synchronous dependency call the orchestrator makes, including Payment
 * and Inventory. Raising it while the three dependencies are degraded
 * does not make any of them faster -- it multiplies the effective
 * request volume each already-strained dependency must absorb (every
 * failed/slow call is retried up to 1-3x), which measurably increases
 * error rate, latency, AND requestConcurrency (retried requests occupy
 * concurrency slots longer), and visibly pushes pressure onto Payment and
 * Inventory even though neither was ever directly degraded. This is
 * authored with real, distinct numbers below (see
 * retry-amplified-moderate / retry-amplified-aggressive).
 *
 * MAX_CHECKOUT_CONCURRENCY_KEY raised without trimming the critical path
 * is a second, independent amplifier: admitting more concurrent requests
 * onto the exact same slow synchronous path does not relieve anything --
 * it increases how much load each degraded dependency sees at once.
 *
 * TIMEOUT_BUDGET_MS_KEY is a genuine, independent latency/error-rate
 * tradeoff lever, applied uniformly to every synchronous dependency call
 * (see controls.ts doc comment). Tightening it to 2000ms fails a slow
 * Pricing/Promotions/Tax call faster -- the orchestrator gives up on that
 * call sooner, so checkoutLatencyMs drops relative to the untouched
 * baseline -- but a meaningfully larger share of those calls never
 * complete within the tighter window at all, so
 * pricingErrorRatePct/promotionsErrorRatePct/taxErrorRatePct all rise.
 * Loosening it to 8000ms is the mirror image: fewer calls time out (lower
 * error rates than baseline) but a slow dependency is allowed to hold the
 * synchronous chain open longer, so checkoutLatencyMs rises above
 * baseline. Neither direction touches Payment or Inventory, and neither
 * ever threatens the business invariants -- this is a pure
 * latency-for-error-rate dial on the three already-degraded dependencies,
 * authored with real, distinct numbers below (see timeout-tightened /
 * timeout-loosened).
 *
 * INVENTORY_RESERVATION_STRATEGY_KEY=optimistic is the tempting-but-unsafe
 * trap distinct from the retry lever: it looks like it helps (lower
 * reported inventory latency, inventory shows "healthy") but it violates
 * the explicit business invariant by creating real, nonzero
 * unreconciledOptimisticReservationCount -- a correctness risk that is
 * never visible in availability/latency metrics alone, checked FIRST
 * (before amplification/trim rules) since it is a correctness violation
 * that must never be masked by whatever else the candidate did to
 * latency.
 */
export const globalCheckoutBrownoutRules: Rule[] = [
  // ── Post-recovery, optimistic trap left engaged. The underlying
  // dependency degradation clearing does not retroactively reconcile
  // reservations that were already accepted optimistically -- a real,
  // counted correctness gap survives natural recovery.
  {
    id: "recovered-optimistic-trap-persists",
    when: {
      triggerEquals: { dependenciesRecovered: true },
      controlEquals: { [INVENTORY_RESERVATION_STRATEGY_KEY]: "optimistic" },
    },
    incidentState: "recovered-optimistic-trap-persists",
    values: {
      checkoutLatencyMs: 900,
      pricingLatencyMs: 150,
      inventoryLatencyMs: 90,
      promotionsLatencyMs: 130,
      taxLatencyMs: 110,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 1,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 1,
      taxErrorRatePct: 1,
      paymentErrorRatePct: 1,
      requestConcurrency: 40,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 97,
      unreconciledOptimisticReservationCount: 14,
      checkoutPathStatus: "warning",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: healthyHealth,
  },
  // ── Post-recovery, clean. Dependencies recovered on their own schedule;
  // in-flight pressure from whatever the candidate was running continues
  // to drain for a real window afterward rather than vanishing instantly
  // (recovery lag), modeled via inFlightDrainingRequests.
  {
    id: "recovered-clean",
    when: {
      triggerEquals: { dependenciesRecovered: true },
    },
    incidentState: "recovered-clean",
    values: {
      checkoutLatencyMs: 820,
      pricingLatencyMs: 150,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 130,
      taxLatencyMs: 110,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 1,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 1,
      taxErrorRatePct: 1,
      paymentErrorRatePct: 1,
      requestConcurrency: 42,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "normal",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 25,
    },
    componentHealth: healthyHealth,
  },

  // ── UNSAFE correctness trap: optimistic inventory reservation while
  // dependencies are degraded. Checked before every amplification/trim
  // rule below so a real correctness violation is never masked by
  // whatever the candidate did elsewhere. Inventory itself reads healthy
  // (fast, low error) -- the trap is specifically that nothing in
  // latency/availability signals the real problem.
  {
    id: "optimistic-reservation-trap",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: { [INVENTORY_RESERVATION_STRATEGY_KEY]: "optimistic" },
    },
    incidentState: "optimistic-reservation-trap",
    values: {
      checkoutLatencyMs: 3_400,
      pricingLatencyMs: 900,
      inventoryLatencyMs: 60,
      promotionsLatencyMs: 850,
      taxLatencyMs: 700,
      paymentLatencyMs: 190,
      pricingErrorRatePct: 9,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 8,
      taxErrorRatePct: 7,
      paymentErrorRatePct: 1,
      requestConcurrency: 150,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 94,
      unreconciledOptimisticReservationCount: 37,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: optimisticTrapHealth,
  },

  // ── HARMFUL pressure-transfer tier 2: aggressive retries (up to 3x)
  // applied uniformly across every dependency call, on top of the
  // already-degraded baseline, with concurrency also raised. This is the
  // required "increasing retries across ALL dependencies should make
  // things measurably worse" path -- real, distinct, worse numbers than
  // the untouched baseline below on every axis: latency, error rate,
  // concurrency, and now Payment/Inventory are visibly affected despite
  // neither ever being directly degraded.
  {
    id: "retry-amplified-aggressive",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: { [RETRY_POLICY_KEY]: "aggressive" },
    },
    incidentState: "retry-amplified-aggressive",
    values: {
      checkoutLatencyMs: 9_200,
      pricingLatencyMs: 1_900,
      inventoryLatencyMs: 640,
      promotionsLatencyMs: 1_850,
      taxLatencyMs: 1_700,
      paymentLatencyMs: 820,
      pricingErrorRatePct: 34,
      inventoryErrorRatePct: 18,
      promotionsErrorRatePct: 33,
      taxErrorRatePct: 31,
      paymentErrorRatePct: 14,
      requestConcurrency: 480,
      partialCheckoutPct: 5,
      paymentAuthSuccessPct: 86,
      inventoryReservationSuccessPct: 91,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "retry-amplified",
      inFlightDrainingRequests: 0,
    },
    componentHealth: fullyAmplifiedHealth,
  },
  // ── HARMFUL pressure-transfer tier 1: moderate retries (1x) applied
  // uniformly. Worse than the untouched baseline, better than aggressive
  // -- a real, monotonic amplification curve, not a cliff.
  {
    id: "retry-amplified-moderate",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: { [RETRY_POLICY_KEY]: "moderate" },
    },
    incidentState: "retry-amplified-moderate",
    values: {
      checkoutLatencyMs: 5_100,
      pricingLatencyMs: 420,
      inventoryLatencyMs: 260,
      promotionsLatencyMs: 410,
      taxLatencyMs: 380,
      paymentLatencyMs: 340,
      pricingErrorRatePct: 14,
      inventoryErrorRatePct: 5,
      promotionsErrorRatePct: 13,
      taxErrorRatePct: 12,
      paymentErrorRatePct: 4,
      requestConcurrency: 240,
      partialCheckoutPct: 2,
      paymentAuthSuccessPct: 96,
      inventoryReservationSuccessPct: 98,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "retry-amplified",
      inFlightDrainingRequests: 0,
    },
    componentHealth: amplifiedHealth,
  },

  // ── Concurrency-only amplification: raising maxCheckoutConcurrency
  // without trimming the critical path admits more requests onto the
  // same slow synchronous path -- worse than baseline, a distinct
  // amplifier from retries (stacked combinations of both are covered by
  // the two retry-tier rules above taking priority whenever retries are
  // also raised, since those are checked first).
  {
    id: "concurrency-amplified",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlAtLeast: { [MAX_CHECKOUT_CONCURRENCY_KEY]: 200 },
    },
    incidentState: "concurrency-amplified",
    values: {
      checkoutLatencyMs: 4_300,
      pricingLatencyMs: 260,
      inventoryLatencyMs: 220,
      promotionsLatencyMs: 240,
      taxLatencyMs: 230,
      paymentLatencyMs: 260,
      pricingErrorRatePct: 7,
      inventoryErrorRatePct: 3,
      promotionsErrorRatePct: 6,
      taxErrorRatePct: 6,
      paymentErrorRatePct: 2,
      requestConcurrency: 200,
      partialCheckoutPct: 1,
      paymentAuthSuccessPct: 98,
      inventoryReservationSuccessPct: 99,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: baselineDegradedHealth,
  },

  // ── Timeout budget loosened to 8000ms: fewer per-dependency calls time
  // out (lower error rates than the untouched baseline) but a slow
  // Pricing/Promotions/Tax call is allowed to hold the synchronous chain
  // open longer, so checkoutLatencyMs rises above baseline. Payment and
  // Inventory are untouched -- this lever never affects correctness.
  {
    id: "timeout-loosened",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: { [TIMEOUT_BUDGET_MS_KEY]: 8_000 },
    },
    incidentState: "timeout-loosened",
    values: {
      checkoutLatencyMs: 4_100,
      pricingLatencyMs: 1_350,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 1_300,
      taxLatencyMs: 1_150,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 4,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 3,
      taxErrorRatePct: 3,
      paymentErrorRatePct: 1,
      requestConcurrency: 150,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: baselineDegradedHealth,
  },
  // ── Timeout budget tightened to 2000ms: a slow call is abandoned
  // sooner, freeing the request thread faster -- checkoutLatencyMs drops
  // below the untouched baseline -- but a meaningfully larger share of
  // those abandoned calls never complete within the tighter window,
  // raising pricing/promotions/tax error rates above baseline. Payment
  // and Inventory are untouched -- this lever never affects correctness.
  {
    id: "timeout-tightened",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: { [TIMEOUT_BUDGET_MS_KEY]: 2_000 },
    },
    incidentState: "timeout-tightened",
    values: {
      checkoutLatencyMs: 2_450,
      pricingLatencyMs: 620,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 600,
      taxLatencyMs: 520,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 19,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 17,
      taxErrorRatePct: 15,
      paymentErrorRatePct: 1,
      requestConcurrency: 100,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: baselineDegradedHealth,
  },

  // ── OPTIMAL: all three non-critical dependencies fully trimmed off the
  // synchronous path (Promotions disabled, Tax on bounded fallback,
  // Pricing on cached fallback) AND enrichment reduced. Checkout latency
  // falls back under budget; Payment/Inventory remain fully correct and
  // untouched throughout; partialCheckoutPct is visibly nonzero,
  // honestly reflecting reduced functionality rather than hiding it.
  {
    id: "critical-path-trimmed-full",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: {
        [PROMOTIONS_MODE_KEY]: "disabled",
        [TAX_MODE_KEY]: "bounded-fallback",
        [PRICING_MODE_KEY]: "cached-fallback",
        [ENRICHMENT_MODE_KEY]: "reduced",
      },
    },
    incidentState: "critical-path-trimmed-full",
    values: {
      checkoutLatencyMs: 650,
      pricingLatencyMs: 20,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 0,
      taxLatencyMs: 15,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 0,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 0,
      taxErrorRatePct: 0,
      paymentErrorRatePct: 1,
      requestConcurrency: 55,
      partialCheckoutPct: 100,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "normal",
      checkoutMitigationMode: "critical-path-trimmed",
      inFlightDrainingRequests: 0,
    },
    componentHealth: trimmedHealth,
  },
  // ── ACCEPTABLE/partial trim: Promotions disabled and Tax on bounded
  // fallback, but Pricing left live and enrichment left full. Checkout
  // latency drops meaningfully (two of three slow calls removed) but not
  // all the way under the full-health budget -- a genuine, bounded,
  // partially-degraded-but-safe state. Correctness is still fully intact.
  {
    id: "critical-path-trimmed-partial",
    when: {
      triggerEquals: { dependenciesDegraded: true },
      controlEquals: {
        [PROMOTIONS_MODE_KEY]: "disabled",
        [TAX_MODE_KEY]: "bounded-fallback",
      },
    },
    incidentState: "critical-path-trimmed-partial",
    values: {
      checkoutLatencyMs: 1_450,
      pricingLatencyMs: 850,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 0,
      taxLatencyMs: 15,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 8,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 0,
      taxErrorRatePct: 0,
      paymentErrorRatePct: 1,
      requestConcurrency: 90,
      partialCheckoutPct: 60,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "warning",
      checkoutMitigationMode: "critical-path-partially-trimmed",
      inFlightDrainingRequests: 0,
    },
    componentHealth: {
      ...healthyHealth,
      promotions: "healthy",
      tax: "healthy",
      pricing: "degraded",
    },
  },

  // ── Untouched baseline: all three dependencies degraded, no control
  // changed from its initial value. Checkout is unusable purely because
  // all three moderate degradations compose on the synchronous path --
  // nothing here is "down."
  {
    id: "baseline-degraded-unmitigated",
    when: {
      triggerEquals: { dependenciesDegraded: true },
    },
    incidentState: "baseline-degraded-unmitigated",
    values: {
      checkoutLatencyMs: 3_150,
      pricingLatencyMs: 850,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 820,
      taxLatencyMs: 680,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 8,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 7,
      taxErrorRatePct: 6,
      paymentErrorRatePct: 1,
      requestConcurrency: 120,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "critical",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: baselineDegradedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      checkoutLatencyMs: 800,
      pricingLatencyMs: 150,
      inventoryLatencyMs: 120,
      promotionsLatencyMs: 130,
      taxLatencyMs: 110,
      paymentLatencyMs: 180,
      pricingErrorRatePct: 1,
      inventoryErrorRatePct: 1,
      promotionsErrorRatePct: 1,
      taxErrorRatePct: 1,
      paymentErrorRatePct: 1,
      requestConcurrency: 40,
      partialCheckoutPct: 0,
      paymentAuthSuccessPct: 100,
      inventoryReservationSuccessPct: 100,
      unreconciledOptimisticReservationCount: 0,
      checkoutPathStatus: "normal",
      checkoutMitigationMode: "unresolved",
      inFlightDrainingRequests: 0,
    },
    componentHealth: healthyHealth,
  },
];
