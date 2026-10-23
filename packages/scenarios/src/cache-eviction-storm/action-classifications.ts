import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_CONCURRENCY_KEY,
  CACHE_ADMISSION_POLICY_KEY,
  CACHE_MEMORY_MULTIPLIER_KEY,
  CACHE_TTL_KEY,
  DB_PROTECTION_KEY,
  OBJECT_CACHING_POLICY_KEY,
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
    controlKey: CACHE_ADMISSION_POLICY_KEY,
    valueEquals: "sizeAwareAdmission",
    whenTriggerEquals: { evictionChurnRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Fixed admission for the new key cardinality",
      explanation:
        "Switching to size-aware admission stopped the cache from wholesale-admitting the long tail of newly numerous distinct keys that would be evicted before ever being reused. Eviction rate and hit ratio fully recovered because the cache's admitted working set now matches what traffic actually reuses, regardless of how much memory was provisioned.",
    },
  },
  {
    id: "acr_2",
    controlKey: OBJECT_CACHING_POLICY_KEY,
    valueEquals: "projectedFields",
    whenTriggerEquals: { evictionChurnRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Cached only what the read path needs",
      explanation:
        "Caching projected fields instead of the full object shrank each entry's footprint back down, undoing the effect of the deployment's larger payloads. The same memory now holds a working set that actually fits, so eviction churn fully resolved without adding any capacity.",
    },
  },
  {
    id: "acr_3",
    controlKey: CACHE_MEMORY_MULTIPLIER_KEY,
    valueAtLeast: 4,
    whenTriggerEquals: { evictionChurnRising: true },
    outcome: "neutral",
    feedback: {
      title: "Bought room without changing what's being stored",
      explanation:
        "Raising cache memory reduced how often entries were evicted, and database read load dropped along with it — genuine, measurable relief. But the deployment changed object size and key cardinality, not just traffic volume: every entry cached is still the new, larger shape, and the new, larger set of distinct keys is still being admitted wholesale. The larger working set grew into the larger ceiling, so eviction churn never fully stabilized — more memory delayed the same problem at a bigger scale rather than removing it.",
    },
  },
  {
    id: "acr_4",
    controlKey: API_CONCURRENCY_KEY,
    valueEquals: "high",
    whenTriggerEquals: { evictionChurnRising: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that wasn't the bottleneck",
      explanation:
        "The cache's hit ratio had already collapsed. Increasing API concurrency let more requests run concurrently, but each one was just as likely to miss as before — so it produced more concurrent misses against an unchanged hit ratio, pushing additional read load onto an already-struggling database rather than relieving anything.",
    },
  },
  {
    id: "acr_5",
    controlKey: CACHE_TTL_KEY,
    valueAtMost: 300,
    whenTriggerEquals: { evictionChurnRising: true },
    outcome: "harmful",
    feedback: {
      title: "Shortened entry lifetime on top of memory-pressure evictions",
      explanation:
        "Lowering TTL proactively expires entries sooner. On top of the memory-pressure evictions already happening because of the larger objects and higher cardinality, this shrank effective cache lifetime further — eviction rate and hit ratio got measurably worse than the unmitigated baseline.",
    },
  },
  {
    id: "acr_6",
    controlKey: DB_PROTECTION_KEY,
    valueEquals: "coalescing",
    whenTriggerEquals: { evictionChurnRising: true },
    outcome: "neutral",
    feedback: {
      title: "Protected the database, not the cache",
      explanation:
        "Request coalescing meaningfully reduced redundant database reads and improved customer-facing latency — a real, legitimate way to shield the database while a durable fix is applied. But it does nothing about the cache's own thrashing: eviction rate and hit ratio stayed essentially unchanged, because the cache's admitted working set and per-entry footprint were never addressed.",
    },
  },
];
