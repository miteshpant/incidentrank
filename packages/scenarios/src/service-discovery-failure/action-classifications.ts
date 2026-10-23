import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
  ENDPOINT_CACHE_TTL_SECONDS_KEY,
  FALLBACK_ROUTING_KEY,
  HEALTH_CHECK_POLICY_KEY,
  RETRY_COUNT_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries authored post-incident feedback (Phase 6B section 13):
 * never "the correct answer was X", always what happened / why / what
 * tradeoff existed. Ids are stable and neutral, never self-descriptive
 * of the authored logic (Phase 6B's feedback leak-boundary requirement).
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: RETRY_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { registryDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Retries amplified load against the same bad endpoints",
      explanation:
        "Discovery kept returning the same stale/unhealthy endpoint list regardless of how many times Service A retried. Raising the retry count multiplied connection attempts against instances that were never going to succeed, increasing failure volume and load instead of improving anything.",
    },
  },
  {
    id: "acr_2",
    controlKey: RETRY_COUNT_KEY,
    valueAtMost: 3,
    whenTriggerEquals: { registryDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Kept retry pressure modest",
      explanation:
        "Leaving the retry count low avoided compounding load against a registry snapshot that was already handing out dead endpoints, instead of trying to retry past a problem retries alone couldn't fix.",
    },
  },
  {
    id: "acr_3",
    controlKey: DISCOVERY_REFRESH_INTERVAL_SECONDS_KEY,
    valueAtMost: 10,
    whenTriggerEquals: { registryDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Sped up discovery refresh",
      explanation:
        "Shortening the refresh interval made Service C re-poll the registry far more often, so stale entries were replaced with current health information much sooner instead of being handed out long after they went bad.",
    },
  },
  {
    id: "acr_4",
    controlKey: ENDPOINT_CACHE_TTL_SECONDS_KEY,
    valueAtMost: 15,
    whenTriggerEquals: { registryDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Shortened how long a resolved endpoint list was trusted",
      explanation:
        "A short cache TTL meant Service A stopped reusing an already-resolved endpoint list almost as soon as it was issued, reducing how long any one stale resolution stayed in effect even between registry refreshes.",
    },
  },
  {
    id: "acr_5",
    controlKey: FALLBACK_ROUTING_KEY,
    valueEquals: true,
    whenTriggerEquals: { registryDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Routed around the bad registry snapshot",
      explanation:
        "Enabling fallback routing let Service A fall back to its own last-known-healthy endpoints instead of trusting whatever the registry currently handed out, giving it a safety net independent of how stale discovery's data was.",
    },
  },
  {
    id: "acr_6",
    controlKey: HEALTH_CHECK_POLICY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { registryDegraded: true },
    outcome: "harmful",
    feedback: {
      title: "Evicted endpoints faster than they could be replaced",
      explanation:
        "Aggressive health-check eviction removed failing endpoints from the registry's bookkeeping quickly, but without also shortening the refresh interval, Service A wasn't re-polling often enough to receive replacement healthy endpoints in time. The healthy pool shrank further before it recovered, trading a stale-endpoint problem for a capacity problem.",
    },
  },
];
