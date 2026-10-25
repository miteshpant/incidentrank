import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHING_ENABLED_KEY,
  GLOBAL_FLEET_SCALING_KEY,
  PER_TENANT_QUOTA_KEY,
  PRIORITY_CLASS_KEY,
  TENANT_ISOLATION_KEY,
  WORKLOAD_ROUTING_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only — never read by resolution logic. Every meaningful
 * rule carries `feedback` per phase6c.md section 14. Ids are stable and
 * intentionally neutral, never self-descriptive of the authored logic.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    id: "acr_1",
    controlKey: PER_TENANT_QUOTA_KEY,
    valueEquals: "strict",
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped the hot tenant's own throughput",
      explanation:
        "A strict per-tenant quota limited the hot tenant's own request rate directly, so every other tenant's share of the shared fleet and data layer returned to a fair baseline. The cost is real and visible: the hot tenant's own throughput was reduced. That tradeoff — protecting the platform and every other tenant at the direct expense of the one generating the load — is the core fairness decision this incident asks for.",
    },
  },
  {
    id: "acr_2",
    controlKey: TENANT_ISOLATION_KEY,
    valueEquals: true,
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Isolated the hot tenant onto dedicated capacity",
      explanation:
        "Moving the hot tenant onto dedicated fleet and data-layer capacity fully protected every other tenant without capping the hot tenant's own throughput at all. That protection was bought with a real, ongoing infrastructure cost rather than a throttle — a legitimate alternative to restricting one tenant's traffic, provided the cost of that dedicated capacity is an acceptable tradeoff.",
    },
  },
  {
    id: "acr_3",
    controlKey: WORKLOAD_ROUTING_KEY,
    valueEquals: "dedicatedLane",
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "beneficial",
    feedback: {
      title: "Capped the hot tenant's share of existing capacity",
      explanation:
        "Routing the hot tenant into a dedicated, capacity-capped lane carved out of the existing shared fleet protected every other tenant without provisioning new infrastructure. The hot tenant's own throughput was still capped against that lane's ceiling — a cheaper variant of the same throttling tradeoff, rather than a free fix.",
    },
  },
  {
    id: "acr_4",
    controlKey: GLOBAL_FLEET_SCALING_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "harmful",
    feedback: {
      title: "Scaled capacity without constraining the hot tenant's share",
      explanation:
        "Adding fleet capacity raised the ceiling, but nothing limited how much of that larger pool the hot tenant could consume — its own traffic grew to fill the extra headroom too. The fleet itself stopped looking saturated, but the shared data layer underneath stayed critically pressured and every other tenant's latency remained degraded. Scaling relieves a capacity problem; it cannot fix a fairness problem.",
    },
  },
  {
    id: "acr_5",
    controlKey: PRIORITY_CLASS_KEY,
    valueEquals: "deprioritizeHot",
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "neutral",
    feedback: {
      title: "Reordered queueing without reducing volume",
      explanation:
        "Deprioritizing the hot tenant's requests let other tenants' requests get served first under contention, giving real relief. But the hot tenant's actual request volume against the shared data layer was unchanged, so pressure there — and the resulting latency for other tenants — only partially eased rather than clearing.",
    },
  },
  {
    id: "acr_6",
    controlKey: CACHING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "neutral",
    feedback: {
      title: "Cached the readable portion of a write-heavy workload",
      explanation:
        "Caching absorbed repeat reads, giving some relief. But this incident's load from the hot tenant was a write-heavy batch workload — caching does nothing for write volume, so pressure on the shared data layer and other tenants' latency improved only partially.",
    },
  },
  {
    id: "acr_7",
    controlKey: PER_TENANT_QUOTA_KEY,
    valueEquals: "moderate",
    whenTriggerEquals: { hotTenantTrafficRising: true },
    outcome: "neutral",
    feedback: {
      title: "Trimmed bursts without capping sustained volume",
      explanation:
        "A moderate quota trimmed the hot tenant's traffic spikes, giving some relief to other tenants. But it did not meaningfully reduce the hot tenant's sustained request rate, so the shared fleet and data layer stayed under real, if lessened, pressure.",
    },
  },
];
