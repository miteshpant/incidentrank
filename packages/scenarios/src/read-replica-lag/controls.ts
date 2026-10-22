import type { ControlDefinition } from "@incidentrank/simulator";

export const READ_ROUTING_MODE_KEY = "readRoutingMode";
export const REPLICATION_BATCH_SIZE_KEY = "replicationBatchSize";
export const WRITE_THROTTLE_ENABLED_KEY = "writeThrottleEnabled";

export const controls: ControlDefinition[] = [
  {
    key: READ_ROUTING_MODE_KEY,
    allowedValues: ["always-replica", "primary-for-recent-writes", "always-primary"],
    initialValue: "always-replica",
  },
  {
    key: REPLICATION_BATCH_SIZE_KEY,
    allowedValues: ["small", "medium", "large"],
    initialValue: "medium",
  },
  {
    key: WRITE_THROTTLE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
