import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  AUTH_MIDDLEWARE_MODE_KEY,
  BACKEND_CAPACITY_KEY,
  CONNECTION_REUSE_ENABLED_KEY,
  GATEWAY_CAPACITY_KEY,
  RATE_LIMIT_AT_GATEWAY_KEY,
  ROUTE_COMPLEXITY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per Phase 6C's mandatory post-incident-
 * feedback requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: CONNECTION_REUSE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "beneficial",
    feedback: {
      title: "Restored persistent upstream connections",
      explanation:
        "Reusing connections to the service fleet removed the per-request connection setup/teardown cost that had been burning gateway CPU. Combined with simplified routing, this is one half of the actual fix — on its own it still leaves route-matching overhead in place.",
    },
  },
  {
    id: "acr_2",
    controlKey: ROUTE_COMPLEXITY_KEY,
    valueEquals: "simplified",
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "beneficial",
    feedback: {
      title: "Simplified the route-matching table",
      explanation:
        "Replacing the newly deployed verbose, regex-heavy route table with a precompiled one cut the CPU cost of matching every incoming request. Combined with connection reuse, this is the other half of the actual fix — on its own it still leaves per-request connection churn in place.",
    },
  },
  {
    id: "acr_3",
    controlKey: AUTH_MIDDLEWARE_MODE_KEY,
    valueEquals: "lightweight",
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "beneficial",
    feedback: {
      title: "Cached identity-provider introspection",
      explanation:
        "Switching to lightweight auth-middleware mode cached introspection results for a short validity window instead of calling the identity provider on every single request, while keeping authentication and authorization genuinely enforced. This alone removed enough per-request overhead to recover the gateway without touching connection handling or routing at all.",
    },
  },
  {
    id: "acr_4",
    controlKey: AUTH_MIDDLEWARE_MODE_KEY,
    valueEquals: "bypass",
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "harmful",
    feedback: {
      title: "Disabled authentication to relieve the gateway",
      explanation:
        "Bypassing auth middleware removed the per-request identity-provider introspection cost entirely, and every load metric recovered immediately. But this also removed authentication and authorization enforcement from every request passing through the gateway for as long as it stayed off — a security control was traded away, not an inefficiency.",
    },
  },
  {
    id: "acr_5",
    controlKey: BACKEND_CAPACITY_KEY,
    valueAtLeast: 24,
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that wasn't the bottleneck",
      explanation:
        "The service fleet behind the gateway was already idle and fast whenever it was actually reached — the overhead was happening entirely at the gateway (connection churn and route-matching cost), before requests ever got that far. Adding backend capacity did not touch gateway CPU, gateway queue depth, or customer latency at all, while still adding ongoing infrastructure cost.",
    },
  },
  {
    id: "acr_6",
    controlKey: GATEWAY_CAPACITY_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "neutral",
    feedback: {
      title: "Added gateway headroom without removing the overhead",
      explanation:
        "More gateway replicas meant more raw CPU available to absorb the expensive per-request work, giving real relief to queue depth and customer latency. But the underlying per-request overhead — unreused connections and verbose route-matching — was never removed, so each replica still ran hot, and the added capacity carried ongoing cost for a fix that was not durable.",
    },
  },
  {
    id: "acr_7",
    controlKey: RATE_LIMIT_AT_GATEWAY_KEY,
    valueAtLeast: 2_000,
    whenTriggerEquals: { trafficGrowing: true },
    outcome: "neutral",
    feedback: {
      title: "Shed load instead of reducing its cost",
      explanation:
        "Rate limiting at the gateway reduced how much work reached route-matching and connection handling, giving real relief to gateway CPU and queue depth. But it did so by rejecting a share of legitimate requests rather than making each accepted request cheaper, and the per-request overhead remained for everything that was let through.",
    },
  },
];
