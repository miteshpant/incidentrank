import type { ScenarioDefinition } from "./types";
import {
  globalCheckoutBrownoutSimulation,
  ENRICHMENT_MODE_KEY,
  INVENTORY_RESERVATION_STRATEGY_KEY,
  MAX_CHECKOUT_CONCURRENCY_KEY,
  PRICING_MODE_KEY,
  PROMOTIONS_MODE_KEY,
  RETRY_POLICY_KEY,
  TAX_MODE_KEY,
  TIMEOUT_BUDGET_MS_KEY,
} from "./global-checkout-brownout/definition";
import { globalCheckoutBrownoutCandidateUI } from "./global-checkout-brownout/candidate-ui";
import { GLOBAL_CHECKOUT_BROWNOUT_SCORING } from "./global-checkout-brownout/scoring";

/**
 * Global Checkout Brownout — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6d.md, scenario 62). No service behind
 * checkout is fully down. Pricing, Promotions, and Tax have each begun
 * returning moderately elevated latency and error rates at the same
 * time — individually, none of the three looks like an outage. Because
 * all three sit on the same synchronous checkout critical path, their
 * latencies compose: the end-to-end checkout request now takes far
 * longer than customers will tolerate, even though every single
 * dependency's own health dashboard reads "degraded," never "down."
 * Business invariants: payment authorization and inventory reservation
 * must remain correct at all times — this can never be traded away to
 * relieve latency elsewhere, no matter how severe the brownout. Promotions
 * may be disabled outright for the duration of the incident. Tax may use
 * the business-authorized bounded fallback rate table instead of a live
 * calculation. Pricing may serve a short-TTL cached price instead of a
 * live call. Checkout may return reduced enrichment, or a visibly
 * partial/reduced-functionality result, rather than fail end-to-end.
 */
export const globalCheckoutBrownout: ScenarioDefinition = {
  id: "global-checkout-brownout",
  slug: "global-checkout-brownout",
  version: 1,
  name: "Global Checkout Brownout",
  description:
    "No service behind checkout is fully down. Pricing, Promotions, and Tax have each begun returning moderately elevated latency and error rates at the same time — individually, none of the three looks like an outage on its own health dashboard. Because all three sit on the same synchronous checkout critical path, their latencies add together rather than hide behind each other, and end-to-end checkout latency has become unusable even though nothing reads as 'down.' Business invariants: payment authorization and inventory reservation must remain correct at all times and can never be traded away to relieve latency elsewhere, however severe the brownout gets. Promotions may be disabled outright for the duration of the incident. Tax may use the business-authorized bounded fallback rate table instead of a live calculation. Pricing may serve a short-TTL cached price instead of calling live. Checkout may return reduced enrichment, or a visibly partial/reduced-functionality result, rather than fail end-to-end.",
  difficulty: "principal",
  estimatedMinutes: 20,
  isFree: false,
  simulation: globalCheckoutBrownoutSimulation,
  library: {
    category: "Distributed Systems",
    tags: ["Checkout", "Critical Path", "Latency Composition", "Retry Amplification", "Degraded Mode"],
    skills: [
      "Recognizing that several individually-survivable degradations compose into an unusable synchronous critical path",
      "Distinguishing optional/degradable functionality from correctness-critical functionality",
      "Recognizing that increasing retries/concurrency across already-strained dependencies amplifies load rather than relieving it",
      "Preserving a hard business invariant (payment/inventory correctness) while intentionally reducing functionality elsewhere",
    ],
    shortDescription:
      "Three moderately degraded dependencies compose on the synchronous checkout path into an unusable incident — nothing is down, but checkout still fails.",
  },
};

export {
  globalCheckoutBrownoutSimulation,
  globalCheckoutBrownoutCandidateUI,
  GLOBAL_CHECKOUT_BROWNOUT_SCORING,
  ENRICHMENT_MODE_KEY,
  INVENTORY_RESERVATION_STRATEGY_KEY,
  MAX_CHECKOUT_CONCURRENCY_KEY,
  PRICING_MODE_KEY,
  PROMOTIONS_MODE_KEY,
  RETRY_POLICY_KEY,
  TAX_MODE_KEY,
  TIMEOUT_BUDGET_MS_KEY,
};
