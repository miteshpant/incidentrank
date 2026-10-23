import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_INSTANCE_COUNT_KEY,
  HOT_TENANT_CACHE_ENABLED_KEY,
  PARTITIONING_STRATEGY_KEY,
  ROUTING_POLICY_KEY,
  SHARD_SPLIT_INITIATED_KEY,
  TENANT_THROTTLE_KEY,
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
    controlKey: PARTITIONING_STRATEGY_KEY,
    valueEquals: "saltedHash",
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Re-keyed with a salted hash",
      explanation:
        "Salting the partition key spread every tenant's traffic — including the high-volume ones — evenly across all four partitions, regardless of any single tenant's volume. Partition A's request rate, latency, and queue depth all returned to baseline, and every other tenant's data locality was preserved. This is the structural fix: the hashing scheme itself, not any single tenant's behavior, was the root cause.",
    },
  },
  {
    id: "acr_2",
    controlKey: PARTITIONING_STRATEGY_KEY,
    valueEquals: "roundRobin",
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "neutral",
    feedback: {
      title: "Balanced load by giving up tenant locality",
      explanation:
        "Round-robin keying ignores tenant identity entirely, so load spreads evenly and every symptom clears. But a given tenant's data no longer consistently lands on the same partition, which can break assumptions other parts of the system make about per-tenant locality. This is a legitimate way to stabilize the platform, but it is a different tradeoff than fixing the hash itself.",
    },
  },
  {
    id: "acr_3",
    controlKey: TENANT_THROTTLE_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "neutral",
    feedback: {
      title: "Protected the platform by constraining the hot tenants",
      explanation:
        "Strictly throttling the identified high-volume tenants directly reduced the load they were putting on Partition A, protecting every other tenant and the shared partition itself. The tradeoff is visible and real: the throttled tenants' own request throughput dropped. This is a defensible choice under pressure, but it treats tenants unequally rather than fixing the underlying concentration.",
    },
  },
  {
    id: "acr_4",
    controlKey: TENANT_THROTTLE_KEY,
    valueEquals: "moderate",
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "neutral",
    feedback: {
      title: "Trimmed bursts without addressing sustained volume",
      explanation:
        "A moderate throttle softened traffic spikes but did not meaningfully reduce the hot tenants' sustained request rate, so Partition A stayed degraded rather than critical. Some relief is real, but the underlying concentration was still present.",
    },
  },
  {
    id: "acr_5",
    controlKey: API_INSTANCE_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled the layer that wasn't the bottleneck",
      explanation:
        "Partition A was the constrained resource, not the API tier. Adding more API instances opened more concurrent connections, and all of them still routed to the same hot partition — Partition A's queue depth and latency got worse, while Partitions B, C, and D remained idle the entire time. Broad capacity cannot fix a skew problem.",
    },
  },
  {
    id: "acr_6",
    controlKey: SHARD_SPLIT_INITIATED_KEY,
    valueEquals: true,
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "neutral",
    feedback: {
      title: "Relieved Partition A by drawing on Partition B's capacity",
      explanation:
        "Splitting Partition A's key range across two shards genuinely relieved its load — but the new shard's capacity was carved out of Partition B's own headroom, so Partition B started running permanently warmer as the direct, visible cost of the split. Pairing the split with least-loaded routing lets Partition B's absorbed traffic fail over elsewhere instead of queueing there alone, resolving the transfer rather than just moving it.",
    },
  },
  {
    id: "acr_7",
    controlKey: ROUTING_POLICY_KEY,
    valueEquals: "leastLoaded",
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Let read traffic fail over away from pressure",
      explanation:
        "Routing reads to the least-loaded replica meant that when the shard split pulled capacity from Partition B, B's own absorbed traffic could spill over to Partitions C and D instead of queueing on B alone. This did not address Partition A's concentration by itself, but it kept a necessary migration from creating a new bottleneck elsewhere.",
    },
  },
  {
    id: "acr_8",
    controlKey: HOT_TENANT_CACHE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { tenantConcentrationRising: true },
    outcome: "neutral",
    feedback: {
      title: "Cached the hot reads, not the underlying concentration",
      explanation:
        "A routing-layer cache for the hot tenants' most-requested keys absorbed a meaningful share of repeat reads once warm, giving real relief. But every write and every cache-miss read still routed to Partition A, and a cold cache under live load still had to fill from the same overloaded partition — so the concentration itself remained unaddressed.",
    },
  },
];
