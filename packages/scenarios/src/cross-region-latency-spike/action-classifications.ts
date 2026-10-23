import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CROSS_REGION_DEPENDENCY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  REGIONAL_FAILOVER_KEY,
  TRAFFIC_LOCALITY_KEY,
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
    controlKey: PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
    valueEquals: "eventual",
    whenTriggerEquals: { rttSpiking: true },
    outcome: "harmful",
    feedback: {
      title: "Relaxed consistency on the one path that cannot afford it",
      explanation:
        "Every customer-facing latency metric improved immediately, because both regions could now authorize payments independently without waiting on each other. But the business specifically requires payment authorization to stay strongly consistent — two regions deciding independently during a network-degraded window can both authorize the same payment, producing a double charge that cannot be safely reconciled after the fact. Availability looking healthy here conceals a real correctness problem rather than solving one.",
    },
  },
  {
    id: "acr_2",
    controlKey: CROSS_REGION_DEPENDENCY_KEY,
    valueEquals: "localOnly",
    whenTriggerEquals: { rttSpiking: true },
    outcome: "beneficial",
    feedback: {
      title: "Removed the general path's dependency on the degraded link",
      explanation:
        "Taking the synchronous cross-region call out of the general (non-payment) request path meant that traffic no longer waited on the degraded inter-region round trip at all. Regional customer latency recovered close to normal almost immediately. This works because the data this path serves can tolerate a bounded, asynchronous replication-lag window — it does not touch payment authorization, which stayed synchronous the whole time.",
    },
  },
  {
    id: "acr_3",
    controlKey: GENERAL_CONSISTENCY_MODE_KEY,
    valueEquals: "eventual",
    whenTriggerEquals: { rttSpiking: true },
    outcome: "beneficial",
    feedback: {
      title: "Traded a bounded replication-lag window for recovered latency",
      explanation:
        "Switching the general data path to asynchronous replication let writes commit locally first instead of waiting for both regions to acknowledge across the degraded link. Regional latency improved as a direct result. The tradeoff is real and authored, not hidden: for a bounded window, the two regions' copies of that non-payment data may disagree — an acceptable cost for data the business does not require to stay strongly consistent.",
    },
  },
  {
    id: "acr_4",
    controlKey: READ_ROUTING_KEY,
    valueEquals: "localRegion",
    whenTriggerEquals: { rttSpiking: true },
    outcome: "beneficial",
    feedback: {
      title: "Stopped sending reads across the degraded link",
      explanation:
        "Serving reads from each region's own local replica, rather than always forcing them to the current primary region, removed one more path that was paying the elevated cross-region RTT on every request. This only stays safe alongside the general consistency path's bounded replication-lag window — it is part of the same deliberate tradeoff, not a separate fix.",
    },
  },
  {
    id: "acr_5",
    controlKey: TRAFFIC_LOCALITY_KEY,
    valueEquals: "alwaysGlobal",
    whenTriggerEquals: { rttSpiking: true },
    outcome: "harmful",
    feedback: {
      title: "Forced more traffic across the degraded link",
      explanation:
        "Routing every request through the shared cross-region path regardless of which region the user is in took traffic that did not need to cross the degraded backbone at all and forced it to anyway. Regional customer latency got worse than it already was, for every user in both regions — this is the opposite of what a latency-between-regions incident calls for.",
    },
  },
  {
    id: "acr_6",
    controlKey: REGIONAL_FAILOVER_KEY,
    valueEquals: true,
    whenTriggerEquals: { rttSpiking: true },
    outcome: "harmful",
    feedback: {
      title: "Used a regional-outage tool on a link-latency problem",
      explanation:
        "Regional failover is built for when one region itself is unhealthy and needs to be taken out of rotation — it is not the right tool when both regions are individually fine and the problem is specifically the link between them. Isolating one region as primary-only forced the other region's users through a full cross-region round trip across the already-degraded backbone, for traffic that did not need to leave their own region in the first place.",
    },
  },
];
