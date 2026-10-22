import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DEPLOY_STRATEGY_KEY,
  SESSION_TIMEOUT_MS_KEY,
  STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
} from "./controls";

export const consumerRebalanceStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "rebalanceCount", label: "Rebalance Count", sourceStateKey: "rebalanceCount", format: "number" },
    { key: "groupStableTimeRatio", label: "Group Stable Time", sourceStateKey: "groupStableTimeRatio", format: "percentage" },
    { key: "effectiveThroughput", label: "Effective Throughput", sourceStateKey: "effectiveThroughput", format: "number" },
    { key: "consumerLagMessages", label: "Consumer Lag", sourceStateKey: "consumerLagMessages", format: "number" },
    { key: "groupStatus", label: "Group Status", sourceStateKey: "groupStatus", format: "status" },
  ],
  controls: [
    {
      key: DEPLOY_STRATEGY_KEY,
      label: "Deploy Strategy",
      componentId: "deploy-pipeline",
      valueLabels: {
        "rolling-one-at-a-time": "Rolling (one at a time)",
        "rolling-batched": "Rolling (batched)",
        "blue-green": "Blue-Green",
      },
    },
    {
      key: SESSION_TIMEOUT_MS_KEY,
      label: "Session Timeout",
      componentId: "consumer-group",
      valueLabels: { "6000": "6s", "10000": "10s", "30000": "30s", "60000": "60s" },
    },
    {
      key: STATIC_GROUP_MEMBERSHIP_ENABLED_KEY,
      label: "Static Group Membership",
      componentId: "consumer-group",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "deploy-pipeline", label: "Deploy Pipeline" },
    { id: "health-check-service", label: "Health Check Service" },
    { id: "consumer-group", label: "Consumer Group" },
    { id: "kafka-topic", label: "Kafka Topic" },
    { id: "downstream-processor", label: "Downstream Processor" },
  ],
};
