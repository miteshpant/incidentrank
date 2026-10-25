import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CLIENT_RETRY_COUNT_KEY,
  CLIENT_TIMEOUT_MS_KEY,
  GATEWAY_RETRY_ENABLED_KEY,
  IDEMPOTENCY_KEY_HANDLING_KEY,
  REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
  TRANSACTION_HANDLING_KEY,
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
    controlKey: IDEMPOTENCY_KEY_HANDLING_KEY,
    valueEquals: "enforced",
    whenTriggerEquals: { dependencySlow: true },
    outcome: "beneficial",
    feedback: {
      title: "Enforced idempotency-key checking",
      explanation:
        "Requiring and checking a client-supplied idempotency key before executing the order side effect let the service recognize a retried request as a duplicate of one it already applied, rather than as a new request. Duplicate side effects dropped sharply as soon as this was enabled — but on its own, a check-then-act sequence can still race against a near-simultaneous retry, which is why atomic transaction handling matters too.",
    },
  },
  {
    id: "acr_2",
    controlKey: TRANSACTION_HANDLING_KEY,
    valueEquals: "atomic",
    whenTriggerEquals: { dependencySlow: true },
    outcome: "beneficial",
    feedback: {
      title: "Made the key check and the side effect atomic",
      explanation:
        "Wrapping the idempotency-key check and the side effect in a single transaction closed the race where two near-simultaneous retries could both pass the check before either had recorded its key. Combined with enforced idempotency-key handling, this is what actually holds duplicate side effects at zero, regardless of how aggressively the client or gateway retry.",
    },
  },
  {
    id: "acr_3",
    controlKey: CLIENT_TIMEOUT_MS_KEY,
    valueAtMost: 500,
    whenTriggerEquals: { dependencySlow: true },
    outcome: "harmful",
    feedback: {
      title: "Shortened the timeout that was the actual ambiguity",
      explanation:
        "The client could not tell whether its first request had succeeded before its timeout fired. Shortening that timeout further made the client give up and retry even sooner — against requests that had not actually failed yet — so more copies of the same logical request reached the service while it was still processing the original. Duplicate side effects increased, even though the client appeared more responsive.",
    },
  },
  {
    id: "acr_4",
    controlKey: CLIENT_RETRY_COUNT_KEY,
    valueAtLeast: 10,
    whenTriggerEquals: { dependencySlow: true },
    outcome: "harmful",
    feedback: {
      title: "Raised retries to 'ensure' the request succeeded",
      explanation:
        "Increasing how many times the client retries was meant to make sure a slow request eventually went through. Without the service recognizing a retry's identity, every additional retry was simply another copy of the same request executing its side effect again — apparent request success improved while duplicate side effects got worse, not better.",
    },
  },
  {
    id: "acr_5",
    controlKey: IDEMPOTENCY_KEY_HANDLING_KEY,
    valueEquals: "logged-only",
    whenTriggerEquals: { dependencySlow: true },
    outcome: "neutral",
    feedback: {
      title: "Observed duplicates without stopping them",
      explanation:
        "Logging idempotency keys gave visibility into how often retries were arriving, but the service still executed the side effect for every one of them. Observability into the problem is not the same as protection against it — duplicate side effects continued at essentially the unmitigated rate.",
    },
  },
  {
    id: "acr_6",
    controlKey: REQUEST_DEDUPLICATION_WINDOW_SECONDS_KEY,
    valueAtLeast: 10,
    whenTriggerEquals: { dependencySlow: true },
    outcome: "neutral",
    feedback: {
      title: "Caught retries inside a window, not the cause",
      explanation:
        "A gateway-level deduplication window coalesced retries that arrived while it was still open, giving real but partial relief. Any retry that arrived after the window closed — including the client's later retries — was forwarded as a fresh request and still executed its side effect, because nothing at the point the side effect actually runs was checking for it.",
    },
  },
  {
    id: "acr_7",
    controlKey: GATEWAY_RETRY_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { dependencySlow: true, sustainedRetryPressure: true },
    outcome: "harmful",
    feedback: {
      title: "Left a second, independent source of retries running",
      explanation:
        "With idempotency not yet enforced, gateway-level retries on slow or failed responses compounded on top of the client's own retries — a second, independent source of duplicate requests the client never even knows happened. Leaving this on while the dependency stayed slow deepened the duplication the client-side retries were already causing.",
    },
  },
];
