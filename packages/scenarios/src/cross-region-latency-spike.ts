import type { ScenarioDefinition } from "./types";
import {
  crossRegionLatencySpikeSimulation,
  TRAFFIC_LOCALITY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  CROSS_REGION_DEPENDENCY_KEY,
  REGIONAL_FAILOVER_KEY,
} from "./cross-region-latency-spike/definition";
import { crossRegionLatencySpikeCandidateUI } from "./cross-region-latency-spike/candidate-ui";
import { CROSS_REGION_LATENCY_SPIKE_SCORING } from "./cross-region-latency-spike/scoring";

/**
 * Cross-Region Latency Spike — a paid IncidentRank scenario
 * (docs/implementation_plan/phase6b.md, scenario 40). A backbone/transit
 * issue has sharply raised round-trip latency specifically between the
 * US and EU regions, while both regions remain individually healthy.
 * Payment authorization must stay strongly consistent — a payment
 * authorized independently by both regions during the same
 * network-degraded window risks a double charge that cannot be safely
 * reconciled afterward — but no other business constraint mandates
 * synchronous cross-region behavior for the rest of the platform's
 * traffic. The candidate must decide how much of the general request
 * path is worth trading consistency for latency, without touching the
 * one operation the business has ruled out of that tradeoff.
 */
export const crossRegionLatencySpike: ScenarioDefinition = {
  id: "cross-region-latency-spike",
  slug: "cross-region-latency-spike",
  version: 1,
  name: "Cross-Region Latency Spike",
  description:
    "Round-trip latency between the US and EU regions has spiked sharply, and both regions otherwise report healthy local metrics — this is specifically a problem with the link between them. Payment authorization must remain strongly consistent across regions: a business requirement, because an authorization decided independently by both regions during this kind of network degradation risks a double charge that cannot be safely undone afterward. No other business constraint requires the rest of the platform's cross-region traffic to stay synchronous. Diagnose what is actually driving customer-facing latency in each region, and decide how to respond without compromising the one operation that cannot afford it.",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  structure: "linear",
  simulation: crossRegionLatencySpikeSimulation,
  library: {
    category: "Distributed Systems",
    tags: [
      "Cross-Region",
      "Consistency",
      "Availability",
      "Latency",
      "Replication",
      "Multi-Region",
    ],
    skills: [
      "Reasoning about consistency vs. availability vs. latency tradeoffs",
      "Identifying which operations genuinely require strong consistency",
      "Distinguishing a link-latency problem from a regional-health problem",
      "Recognizing when a correctness-critical path must be left alone even under pressure",
    ],
    shortDescription:
      "Inter-region latency has spiked while both regions stay individually healthy, and the candidate must decide which traffic can trade consistency for speed without touching payment authorization.",
  },
};

export {
  crossRegionLatencySpikeSimulation,
  crossRegionLatencySpikeCandidateUI,
  CROSS_REGION_LATENCY_SPIKE_SCORING,
  TRAFFIC_LOCALITY_KEY,
  GENERAL_CONSISTENCY_MODE_KEY,
  PAYMENT_AUTH_CONSISTENCY_MODE_KEY,
  READ_ROUTING_KEY,
  CROSS_REGION_DEPENDENCY_KEY,
  REGIONAL_FAILOVER_KEY,
};
