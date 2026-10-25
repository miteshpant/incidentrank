import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  REFRESH_CONCURRENCY_LIMIT_KEY,
  REFRESH_RETRY_BACKOFF_KEY,
  SINGLE_FLIGHT_COALESCING_KEY,
  STALE_WHILE_REVALIDATE_ENABLED_KEY,
  TTL_JITTER_ENABLED_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every rule carries
 * `feedback` per the mandatory post-incident-feedback requirement. Ids
 * are stable and intentionally neutral, never self-descriptive of the
 * authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: TTL_JITTER_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { expiryApproaching: true },
    outcome: "beneficial",
    feedback: {
      title: "Desynchronized the shared expiry",
      explanation:
        "Randomizing each object's expiry meant the fleet's popular objects stopped expiring in the same instant, so the herd-forming trigger itself stopped firing. This removes the root cause rather than coping with its consequences — no instance ever sees a synchronized miss to race on in the first place.",
    },
  },
  {
    id: "acr_2",
    controlKey: SINGLE_FLIGHT_COALESCING_KEY,
    valueEquals: true,
    whenTriggerEquals: { herdActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Collapsed duplicate refreshes into one",
      explanation:
        "The shared expiry still fired and every instance still detected the miss, but single-flight coalescing meant only one of them actually reached origin per key — every other instance's miss waited on that one result. Origin QPS stayed near steady-state even with the full fleet experiencing the miss at once.",
    },
  },
  {
    id: "acr_3",
    controlKey: STALE_WHILE_REVALIDATE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { herdActive: true },
    outcome: "beneficial",
    feedback: {
      title: "Served stale data instead of blocking on a refresh",
      explanation:
        "Callers received the stale cached value immediately while a single background refresh repopulated each key, so no caller was ever put in the synchronous miss/refresh path at all. This is a real, durable fix for this incident, at the accepted cost of serving briefly stale data to some callers during the refresh window.",
    },
  },
  {
    id: "acr_4",
    controlKey: API_INSTANCE_COUNT_KEY,
    valueAtLeast: 24,
    whenTriggerEquals: { herdActive: true },
    outcome: "harmful",
    feedback: {
      title: "Added more independent refreshers for the same keys",
      explanation:
        "Nothing stopped each API instance from independently detecting the miss and issuing its own origin refresh for the same popular keys. Adding more instances added more independent refreshers racing for those same keys, so origin QPS and concurrent refreshes got measurably worse than the unscaled baseline — even though the fleet itself had more capacity to accept client traffic.",
    },
  },
  {
    id: "acr_5",
    controlKey: REFRESH_CONCURRENCY_LIMIT_KEY,
    valueAtLeast: 400,
    whenTriggerEquals: { herdActive: true },
    outcome: "neutral",
    feedback: {
      title: "Let origin absorb more duplicates instead of removing them",
      explanation:
        "Raising the refresh concurrency ceiling let origin accept more of the herd's duplicate refreshes at once, which brought origin latency and the failure rate down from the unmitigated baseline. But the number of distinct instances independently refreshing the same keys never changed, so origin QPS stayed well above steady-state and the herd will recur at the next synchronized expiry — this masked the symptom rather than removing the duplicate refreshes themselves.",
    },
  },
  {
    id: "acr_6",
    controlKey: REFRESH_RETRY_BACKOFF_KEY,
    valueAtMost: 200,
    whenTriggerEquals: { herdActive: true },
    outcome: "harmful",
    feedback: {
      title: "Retried failed refreshes almost immediately",
      explanation:
        "A very short backoff meant refreshes that failed against the already-saturated origin retried again almost immediately, piling straight back onto origin and compounding the exact load that caused them to fail in the first place. Origin QPS and the refresh failure rate both got worse than the unmitigated baseline.",
    },
  },
];
