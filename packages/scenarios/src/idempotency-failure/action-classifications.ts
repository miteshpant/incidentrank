import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  KEY_SCOPE_KEY,
  KEY_TTL_SECONDS_KEY,
  RETRY_STRATEGY_KEY,
  STORAGE_MODE_KEY,
  STORE_UNAVAILABLE_BEHAVIOR_KEY,
  WORKER_CONCURRENCY_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per Phase 6C's mandatory post-incident-feedback
 * requirement (section 14). Ids are stable and intentionally neutral,
 * never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
    valueEquals: "fail-closed",
    whenTriggerEquals: { storeDegrading: true, storeUnreachable: true },
    outcome: "beneficial",
    feedback: {
      title: "Refused to proceed without a working safety check",
      explanation:
        "With the idempotency store unreachable, fail-closed rejected or queued requests instead of letting the worker guess. That cost real, visible availability — success rate and side-effect throughput both dropped — but it guaranteed no external side effect ran without actually being checked for duplication first.",
    },
  },
  {
    id: "acr_2",
    controlKey: STORAGE_MODE_KEY,
    valueEquals: "replicated",
    outcome: "beneficial",
    feedback: {
      title: "Gave the store a durable standby",
      explanation:
        "Moving the idempotency store to replicated mode meant the primary degrading no longer escalated to the store becoming fully unreachable — there was a standby to serve lookups from. On its own this doesn't fix an eviction-driven or scope-driven duplicate problem, but it removes the unreachability half of the incident.",
    },
  },
  {
    id: "acr_3",
    controlKey: KEY_TTL_SECONDS_KEY,
    valueAtLeast: 300,
    whenTriggerEquals: { storeDegrading: true },
    outcome: "beneficial",
    feedback: {
      title: "Widened the key retention window past the retry horizon",
      explanation:
        "A short key TTL let a legitimate retry arrive after its original key had already been evicted, so the store saw it as a brand-new request. Widening the TTL past any realistic retry delay meant the store still recognized a late retry as the same request it had already processed.",
    },
  },
  {
    id: "acr_4",
    controlKey: KEY_SCOPE_KEY,
    valueEquals: "request-scoped",
    whenTriggerEquals: { storeDegrading: true },
    outcome: "beneficial",
    feedback: {
      title: "Scoped keys to the request's own stable identity",
      explanation:
        "Request-scoped keys neither collapsed distinct requests onto the same key nor failed to recognize retries of the same request. Both of the alternatives have a real failure mode: too broad silently drops legitimate work, too narrow lets real duplicates through.",
    },
  },
  {
    id: "acr_5",
    controlKey: KEY_SCOPE_KEY,
    valueEquals: "too-broad",
    whenTriggerEquals: { storeDegrading: true },
    outcome: "harmful",
    feedback: {
      title: "Collapsed distinct requests onto the same key",
      explanation:
        "Scoping the idempotency key too broadly made the store treat genuinely different requests as duplicates of each other. The duplicate-count metric stayed low — nothing was being re-run — but a real side effect was silently skipped for a legitimate request that was never actually a duplicate.",
    },
  },
  {
    id: "acr_6",
    controlKey: WORKER_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { storeDegrading: true, storeUnreachable: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that wasn't the problem",
      explanation:
        "The idempotency store itself was unreachable, and the worker was still set to proceed anyway. Adding more worker processes increased throughput, but each one independently proceeded with no safety check behind it — duplicate side effects accumulated faster, not slower, even though throughput looked healthier than ever.",
    },
  },
  {
    id: "acr_7",
    controlKey: RETRY_STRATEGY_KEY,
    valueEquals: "aggressive",
    whenTriggerEquals: { storeDegrading: true, storeUnreachable: true },
    outcome: "harmful",
    feedback: {
      title: "Retried faster into an unchecked path",
      explanation:
        "With the idempotency store unreachable and the worker set to fail-open, every retry attempt was another chance for the same request to run its side effect again with no check behind it. Retrying aggressively gave the broken safety net more opportunities to miss, compounding duplicate production rather than helping recovery.",
    },
  },
  {
    id: "acr_8",
    controlKey: STORE_UNAVAILABLE_BEHAVIOR_KEY,
    valueEquals: "fail-open",
    whenTriggerEquals: { storeDegrading: true, storeUnreachable: true },
    outcome: "harmful",
    feedback: {
      title: "Kept throughput flowing with no safety check behind it",
      explanation:
        "Fail-open let requests proceed to the external side effect even though the idempotency store couldn't be queried to check for a duplicate. Success rate and throughput both looked healthy — even slightly elevated — while real duplicate side effects accumulated silently underneath that healthy-looking surface.",
    },
  },
];
