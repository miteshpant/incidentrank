import type { ScenarioDefinition } from "./types";
import {
  consumerRebalanceStormSimulation,
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
} from "./consumer-rebalance-storm/definition";
import { consumerRebalanceStormCandidateUI } from "./consumer-rebalance-storm/candidate-ui";
import { CONSUMER_REBALANCE_STORM_SCORING } from "./consumer-rebalance-storm/scoring";

/**
 * Consumer Rebalance Storm — a paid IncidentRank launch scenario
 * (docs/implementation_plan/phase6.md's suggested launch batch). A
 * rolling, one-pod-at-a-time deploy keeps triggering full Kafka consumer
 * group rebalances — every individual restart stops the whole group,
 * reassigns partitions, and resumes — and because the deploy is slow, a
 * new rebalance fires before the group ever stabilizes. The group spends
 * more time rebalancing than consuming, even though every individual
 * consumer is healthy. Distinct from a backpressure or hot-key incident:
 * the problem here is rebalance FREQUENCY itself.
 */
export const consumerRebalanceStorm: ScenarioDefinition = {
  id: "consumer-rebalance-storm",
  slug: "consumer-rebalance-storm",
  version: 1,
  name: "Consumer Rebalance Storm",
  description:
    "A rolling deploy is restarting consumer instances one at a time, and each individual restart is triggering a full consumer group rebalance — the whole group pauses, partitions get reassigned, and consumption resumes, only for the next restart to trigger another one. The group is spending more time rebalancing than actually processing messages, even though every individual consumer reports healthy. Diagnose the churn and stabilize the group before effective throughput collapses entirely.",
  difficulty: "staff",
  estimatedMinutes: 15,
  isFree: false,
  simulation: consumerRebalanceStormSimulation,
  library: {
    category: "Messaging & Streaming",
    tags: ["Kafka", "Consumer Groups", "Rebalancing", "Deployments", "Observability"],
    skills: [
      "Diagnosing rebalance churn vs. backpressure",
      "Static group membership and session-timeout tuning",
      "Deploy-strategy tradeoffs under stateful coordination",
      "Recognizing plausible-but-harmful mitigations",
    ],
    shortDescription:
      "A slow rolling deploy keeps triggering full consumer group rebalances, and the group never stabilizes long enough to drain its backlog.",
  },
};

export {
  consumerRebalanceStormSimulation,
  consumerRebalanceStormCandidateUI,
  CONSUMER_REBALANCE_STORM_SCORING,
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
};
