import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ENRICHMENT_CALL_ENABLED_KEY,
  FAN_OUT_CONCURRENCY_LIMIT_KEY,
  PARTIAL_RESPONSE_POLICY_KEY,
  REQUEST_BATCHING_ENABLED_KEY,
  RESPONSE_CACHE_ENABLED_KEY,
  SERVICE_E_TIMEOUT_MS_KEY,
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
    controlKey: ENRICHMENT_CALL_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { serviceEDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Excluded the optional enrichment call",
      explanation:
        "Removing Service E (recommendation enrichment) from the fan-out meant the aggregator no longer waited on a degraded, non-essential dependency. Pricing, inventory, shipping, and tax were never affected — the response stayed complete and correct without the enrichment content, trading optional functionality for immediate stability.",
    },
  },
  {
    id: "acr_2",
    controlKey: PARTIAL_RESPONSE_POLICY_KEY,
    valueEquals: "partialAllowed",
    whenTriggerEquals: { serviceEDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Allowed the response to complete without every call",
      explanation:
        "Letting the aggregator return a response once the core dependencies answered — rather than failing the whole request if any single call failed — meant a slow enrichment call no longer took down the entire response. Combined with a short timeout on that call, this achieved essentially the same safety as excluding the call outright, without a hard toggle.",
    },
  },
  {
    id: "acr_3",
    controlKey: SERVICE_E_TIMEOUT_MS_KEY,
    valueEquals: 300,
    whenTriggerEquals: { serviceEDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Tightened the timeout on the degraded call",
      explanation:
        "Cutting the Service E timeout meant the aggregator stopped waiting on a slow enrichment response almost immediately. On its own this increases the chance any one enrichment attempt is cut short, but paired with a policy that tolerates a missing enrichment result, it kept the aggregator from holding threads open against a dependency that wasn't recovering.",
    },
  },
  {
    id: "acr_4",
    controlKey: REQUEST_BATCHING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { serviceEDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Batching relieved one service and pressured another",
      explanation:
        "Batching downstream calls cut the raw call volume reaching Service E and improved customer success from baseline. But batched lookups resolve per-item pricing against Service A synchronously, so the same change pushed Service A's own saturation up — a core dependency now carrying new, visible risk. Batching alone was real progress, not a finished fix.",
    },
  },
  {
    id: "acr_5",
    controlKey: FAN_OUT_CONCURRENCY_LIMIT_KEY,
    valueAtLeast: 200,
    whenTriggerEquals: { serviceEDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "More concurrency fed more requests to a degraded dependency",
      explanation:
        "Raising the fan-out concurrency limit let more requests start at once, but Service E was still slow — each additional concurrent request just piled onto an already-saturated service. Worse, the added concurrency also increased simultaneous load on Service A. If batching was already active, this combination pushed Service A itself into critical saturation: a core dependency broke while chasing relief from the optional one.",
    },
  },
  {
    id: "acr_6",
    controlKey: RESPONSE_CACHE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { serviceEDegraded: true },
    outcome: "neutral",
    feedback: {
      title: "Cached the result, not the fix",
      explanation:
        "A short-TTL cache in front of Service E's responses absorbed repeat identical recommendation lookups, giving real but incomplete relief on its own. Paired with batching, caching also reduced how many items needed a live per-item pricing join, relieving the Service A pressure that batching alone introduced — but by itself, a cold cache miss under live load still called the degraded service directly.",
    },
  },
];
