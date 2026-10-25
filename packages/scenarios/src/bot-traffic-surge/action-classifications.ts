import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHE_AGGRESSIVENESS_KEY,
  CHALLENGE_POLICY_KEY,
  ENDPOINT_PROTECTION_SCOPE_KEY,
  RATE_LIMIT_TIER_KEY,
  TENANT_QUOTA_ENFORCEMENT_KEY,
  TRAFFIC_SAMPLING_ENABLED_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per the mandatory post-incident-feedback
 * requirement. Ids are stable and intentionally neutral, never
 * self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: TRAFFIC_SAMPLING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { botSurgeRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Gave classification something to target",
      explanation:
        "Enabling traffic sampling gave the endpoint-protection and tenant-quota controls real behavioral signal to act on, instead of applying friction to every request uniformly. This is what let the rest of the targeted stack actually distinguish suspicious traffic from ordinary customer usage rather than guessing.",
    },
  },
  {
    id: "acr_2",
    controlKey: ENDPOINT_PROTECTION_SCOPE_KEY,
    valueEquals: "targeted",
    whenTriggerEquals: { botSurgeRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Scoped protection to where the abuse actually was",
      explanation:
        "Restricting friction to the specific endpoints under heaviest automated load protected the backend without touching requests to every other part of the API. Its precision depended on traffic sampling already being enabled — without that signal, this same scope setting was effectively a guess.",
    },
  },
  {
    id: "acr_3",
    controlKey: TENANT_QUOTA_ENFORCEMENT_KEY,
    valueEquals: true,
    whenTriggerEquals: { botSurgeRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped abuse by identity instead of by IP",
      explanation:
        "Per-identity quotas caught automated traffic that rotated across many source IPs but still reused or lacked legitimate credentials, without placing any new limit on identities that were behaving normally. This is what kept the false-positive cost close to zero even as backend load came down.",
    },
  },
  {
    id: "acr_4",
    controlKey: CHALLENGE_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { botSurgeRising: true },
    outcome: "harmful",
    feedback: {
      title: "Blocked the bots by blocking everyone like them",
      explanation:
        "An aggressive challenge policy applies heavy friction to all traffic that looks even slightly unusual, not just traffic with real evidence behind it. Suspicious volume and backend load came down, but a meaningful share of genuine customers — on unfamiliar devices, corporate networks, or legitimate automated integrations — were challenged or blocked right along with the bots, and that cost persisted for as long as the setting stayed aggressive.",
    },
  },
  {
    id: "acr_5",
    controlKey: RATE_LIMIT_TIER_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { botSurgeRising: true },
    outcome: "harmful",
    feedback: {
      title: "Throttled every caller to throttle some of them",
      explanation:
        "A strict global rate limit cuts overall volume, but it applies identically to every caller — it has no way to tell a high-volume real customer or integration apart from a high-volume bot. Legitimate traffic got throttled alongside the automated traffic, while bots that stayed under the uniform ceiling kept getting through untouched.",
    },
  },
  {
    id: "acr_6",
    controlKey: CACHE_AGGRESSIVENESS_KEY,
    valueEquals: "elevated",
    whenTriggerEquals: { botSurgeRising: true },
    outcome: "neutral",
    feedback: {
      title: "Absorbed repeat load without making any judgment call",
      explanation:
        "A more aggressive edge cache absorbed a real share of repeated, cacheable-looking requests — bot and human alike — before they reached the backend. It never had to decide what was suspicious, which is exactly why it only gave partial relief: a meaningful share of automated traffic generates unique, non-cacheable request shapes that still reach the backend directly.",
    },
  },
];
