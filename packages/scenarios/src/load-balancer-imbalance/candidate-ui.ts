import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BALANCING_STRATEGY_KEY,
  CONNECTION_DRAINING_ENABLED_KEY,
  HEALTH_CHECK_SENSITIVITY_KEY,
  INSTANCE_COUNT_KEY,
  STICKY_SESSIONS_ENABLED_KEY,
  TRAFFIC_WEIGHTS_KEY,
} from "./controls";

export const loadBalancerImbalanceCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "instanceARequestRate", label: "Instance A Requests/sec", sourceStateKey: "instanceARequestRate", format: "number" },
    { key: "instanceBRequestRate", label: "Instance B Requests/sec", sourceStateKey: "instanceBRequestRate", format: "number" },
    { key: "instanceCRequestRate", label: "Instance C Requests/sec", sourceStateKey: "instanceCRequestRate", format: "number" },
    { key: "instanceDRequestRate", label: "Instance D Requests/sec", sourceStateKey: "instanceDRequestRate", format: "number" },
    { key: "instanceALatencyMs", label: "Instance A Latency", sourceStateKey: "instanceALatencyMs", format: "duration" },
    { key: "instanceBLatencyMs", label: "Instance B Latency", sourceStateKey: "instanceBLatencyMs", format: "duration" },
    { key: "instanceAConnectionCount", label: "Instance A Connections", sourceStateKey: "instanceAConnectionCount", format: "number" },
    { key: "instanceBConnectionCount", label: "Instance B Connections", sourceStateKey: "instanceBConnectionCount", format: "number" },
    { key: "healthyBackendCount", label: "Healthy Backend Count", sourceStateKey: "healthyBackendCount", format: "number" },
    { key: "globalSuccessRatePct", label: "Global Success Rate", sourceStateKey: "globalSuccessRatePct", format: "percentage" },
    { key: "balancerStatus", label: "Load Balancer Status", sourceStateKey: "balancerStatus", format: "status" },
  ],
  controls: [
    {
      key: BALANCING_STRATEGY_KEY,
      label: "Balancing Strategy",
      componentId: "load-balancer",
      valueLabels: {
        stickyHash: "Sticky Hash",
        leastConnections: "Least Connections",
        roundRobin: "Round Robin",
      },
    },
    {
      key: STICKY_SESSIONS_ENABLED_KEY,
      label: "Sticky Sessions",
      componentId: "load-balancer",
      valueLabels: { false: "Disabled", true: "Enabled" },
    },
    {
      key: HEALTH_CHECK_SENSITIVITY_KEY,
      label: "Health Check Sensitivity",
      componentId: "load-balancer",
      valueLabels: { stale: "Stale", sensitive: "Sensitive" },
    },
    {
      key: INSTANCE_COUNT_KEY,
      label: "Instance Count",
      componentId: "load-balancer",
    },
    {
      key: TRAFFIC_WEIGHTS_KEY,
      label: "Traffic Weights",
      componentId: "load-balancer",
      valueLabels: { even: "Even", favorLightInstances: "Favor Light Instances" },
    },
    {
      key: CONNECTION_DRAINING_ENABLED_KEY,
      label: "Connection Draining",
      componentId: "load-balancer",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "clients", label: "Clients" },
    { id: "load-balancer", label: "Load Balancer" },
    { id: "instance-a", label: "Instance A" },
    { id: "instance-b", label: "Instance B" },
    { id: "instance-c", label: "Instance C" },
    { id: "instance-d", label: "Instance D" },
  ],
};
