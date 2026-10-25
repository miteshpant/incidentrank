import type { ActionClassificationRule } from "@incidentrank/simulator";
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

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only -- never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: PROMOTIONS_MODE_KEY,
    valueEquals: "disabled",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Removed Promotions from the synchronous checkout path",
      explanation:
        "Promotions was one of three moderately degraded dependencies adding its own latency to every checkout request. Disabling it removes that call from the synchronous path entirely -- checkout no longer waits on it at all, with zero correctness cost, since promo-code evaluation never touches payment authorization or inventory reservation.",
    },
  },
  {
    id: "acr_2",
    controlKey: TAX_MODE_KEY,
    valueEquals: "bounded-fallback",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Switched Tax to the business-authorized bounded fallback",
      explanation:
        "Tax was degraded and slowing every checkout that called it live. Serving the pre-approved bounded fallback rate table instead removes a slow synchronous call from the critical path. The business explicitly authorized this approximation during an incident, so this does not violate any correctness invariant -- only the live, exact calculation is skipped.",
    },
  },
  {
    id: "acr_3",
    controlKey: PRICING_MODE_KEY,
    valueEquals: "cached-fallback",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Served cached pricing instead of calling Pricing live",
      explanation:
        "Pricing was the third moderately degraded dependency on the synchronous path. Serving the short-TTL cached price instead of waiting on a live call removes that latency from every checkout, leaving only Cart/Inventory/Payment/Order Service -- all healthy throughout -- on the hot path.",
    },
  },
  {
    id: "acr_4",
    controlKey: ENRICHMENT_MODE_KEY,
    valueEquals: "reduced",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced optional post-checkout enrichment",
      explanation:
        "Loyalty-preview and recommendation enrichment never touch payment or inventory, so removing it from the synchronous confirmation step trims additional unnecessary latency from the critical path at zero correctness cost -- a legitimate, business-sanctioned reduction in functionality rather than a failure.",
    },
  },
  {
    id: "acr_5",
    controlKey: RETRY_POLICY_KEY,
    valueEquals: "moderate",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Increased retries uniformly across every dependency call",
      explanation:
        "Retries at this control apply to every synchronous call the orchestrator makes, not just the degraded ones. Each already-strained Pricing/Promotions/Tax call now gets retried on failure/timeout, multiplying the effective request volume those dependencies must absorb. Checkout latency, error rate, and in-flight concurrency all increased measurably, and pressure visibly spilled onto Payment and Inventory even though neither was ever directly degraded.",
    },
  },
  {
    id: "acr_6",
    controlKey: RETRY_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Set retries to aggressive across every dependency call",
      explanation:
        "At up to three retries per call, applied uniformly across every synchronous dependency, the effective request volume hitting Pricing/Promotions/Tax multiplied far beyond their capacity, and this amplification is no longer contained to the three originally degraded services -- Payment authorization success dropped well below its safe floor and Inventory reservation success degraded too. This is the clearest illustration that 'retry harder' does not fix a composition problem; it turns three moderate degradations into a full collapse.",
    },
  },
  {
    id: "acr_7",
    controlKey: MAX_CHECKOUT_CONCURRENCY_KEY,
    valueEquals: 200,
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Raised max checkout concurrency while dependencies were still slow",
      explanation:
        "Admitting more concurrent checkout requests does not make Pricing, Promotions, or Tax respond any faster -- it simply pushes more simultaneous load onto the exact same degraded synchronous path. Checkout latency and dependency error rates increased as a result, with no corresponding relief anywhere.",
    },
  },
  {
    id: "acr_8",
    controlKey: MAX_CHECKOUT_CONCURRENCY_KEY,
    valueEquals: 50,
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Lowered max checkout concurrency",
      explanation:
        "Admitting fewer concurrent requests reduces how many checkouts are simultaneously waiting on the degraded dependencies, but it does nothing to shorten the per-request critical path itself -- checkout requests that are admitted still experience the same composite latency. This limits blast radius slightly but is not a substitute for trimming the critical path.",
    },
  },
  {
    id: "acr_9",
    controlKey: INVENTORY_RESERVATION_STRATEGY_KEY,
    valueEquals: "optimistic",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Switched inventory reservation to optimistic",
      explanation:
        "Optimistic reservation assumes availability and reconciles afterward instead of confirming a real, atomic hold before authorizing payment. Inventory's own latency and error rate look fine -- the dependency itself was never degraded -- but a real, counted number of unreconciled optimistic reservations began accumulating immediately, a direct oversell risk the business invariant requires never be created regardless of load.",
    },
  },
  {
    id: "acr_10",
    controlKey: INVENTORY_RESERVATION_STRATEGY_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Kept inventory reservation strict",
      explanation:
        "Strict reservation was already the safe default and remains the only mode that can never oversell -- leaving it unchanged preserves the business invariant but is not itself a mitigation for checkout latency.",
    },
  },
  {
    id: "acr_11",
    controlKey: TIMEOUT_BUDGET_MS_KEY,
    valueEquals: 2_000,
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Tightened the per-call timeout budget",
      explanation:
        "Tightening the per-dependency timeout budget gives up on a slow Pricing/Promotions/Tax call sooner, freeing the request thread faster and lowering end-to-end checkout latency below the untouched baseline. The real tradeoff: a meaningfully larger share of those calls now fail outright as timeouts before they can complete, raising pricing/promotions/tax error rates above baseline. Payment and inventory correctness are unaffected either way -- this is a pure latency-for-error-rate dial, not a fix for the underlying critical-path composition problem.",
    },
  },
  {
    id: "acr_12",
    controlKey: TIMEOUT_BUDGET_MS_KEY,
    valueEquals: 8_000,
    whenTriggerEquals: { dependenciesDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Loosened the per-call timeout budget",
      explanation:
        "Loosening the per-dependency timeout budget lets a slow Pricing/Promotions/Tax call hold the synchronous checkout chain open longer, which raises end-to-end checkout latency above the untouched baseline. The tradeoff runs the other way: fewer calls are abandoned as timeouts, so pricing/promotions/tax error rates drop below baseline. Payment and inventory correctness are unaffected either way -- this is a pure latency-for-error-rate dial, not a fix for the underlying critical-path composition problem.",
    },
  },
];
