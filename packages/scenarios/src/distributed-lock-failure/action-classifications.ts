import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
  FENCING_TOKEN_ENABLED_KEY,
  LEASE_DURATION_SECONDS_KEY,
  LEASE_RENEWAL_ENABLED_KEY,
  WORKER_CONCURRENCY_KEY,
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
    controlKey: FENCING_TOKEN_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { processingSlow: true },
    outcome: "beneficial",
    feedback: {
      title: "Made overlapping ownership harmless",
      explanation:
        "Enabling fencing means each lock acquisition is stamped with an increasing token, and the shared resource rejects any write presented with a token older than the one it has already accepted. A lease can still expire mid-job and a second worker can still acquire it, but the original worker's eventual write is rejected rather than applied — so overlapping ownership stops being able to corrupt the shared resource at all, regardless of lease duration.",
    },
  },
  {
    id: "acr_2",
    controlKey: LEASE_DURATION_SECONDS_KEY,
    valueAtLeast: 60,
    whenTriggerEquals: { processingSlow: true },
    outcome: "neutral",
    feedback: {
      title: "Reduced the frequency, not the risk",
      explanation:
        "Lengthening the lease past typical job duration made lease expiry mid-processing much rarer, which looks like recovery on the dashboards. But it did nothing to make an overlap safe if one still occurred, and it made the cost of a genuine worker crash much worse: the shared resource now stays blocked for the full, longer lease duration before anyone else can take over.",
    },
  },
  {
    id: "acr_3",
    controlKey: LEASE_RENEWAL_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { processingSlow: true },
    outcome: "beneficial",
    feedback: {
      title: "Let a live worker protect its own lease",
      explanation:
        "A heartbeat lets a worker that is still actively processing renew its own lease, so expiry-during-processing stops happening for as long as that worker stays alive — a genuine, immediate improvement. It does not, however, help if a worker actually crashes: a dead worker can no longer send the heartbeat, so recovery from a real crash is still bounded by however long the lease is configured for.",
    },
  },
  {
    id: "acr_4",
    controlKey: WORKER_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { processingSlow: true },
    outcome: "harmful",
    feedback: {
      title: "Added more workers to an unsafe race",
      explanation:
        "Raising worker concurrency while leases were still expiring mid-processing meant more workers racing to acquire the same frequently-expiring lock. That increased how often overlapping ownership occurred and how much duplicate, conflicting work landed on the shared resource — concurrency amplifies an existing correctness problem, it does not fix one.",
    },
  },
  {
    id: "acr_5",
    controlKey: ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { processingSlow: true },
    outcome: "harmful",
    feedback: {
      title: "Turned off backoff during contention",
      explanation:
        "With no backoff, a worker that fails to acquire the lock retries immediately in a tight loop. Under contention this floods the Lock Service itself with acquisition attempts, raising lock-service load and contention rate on top of whatever the lease configuration was already producing — a secondary, avoidable source of pressure independent of the underlying expiry problem.",
    },
  },
  {
    id: "acr_6",
    controlKey: ACQUIRE_RETRY_BACKOFF_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { processingSlow: true },
    outcome: "neutral",
    feedback: {
      title: "Backed off on failed acquisitions",
      explanation:
        "Enabling backoff on lock-acquisition failure reduces load on the Lock Service itself during contention, but it does not touch the underlying cause of leases expiring mid-processing. It is a reasonable hygiene improvement, not a fix for overlapping ownership.",
    },
  },
];
