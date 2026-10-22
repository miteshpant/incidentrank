import type { ControlDefinition } from "@incidentrank/simulator";

export const PARTITION_COUNT_KEY = "partitionCount";
export const PARTITION_KEY_STRATEGY_KEY = "partitionKeyStrategy";
export const CONSUMER_INSTANCES_KEY = "consumerInstances";

export const controls: ControlDefinition[] = [
  { key: PARTITION_COUNT_KEY, allowedValues: [4, 8, 16, 32], initialValue: 4 },
  {
    key: PARTITION_KEY_STRATEGY_KEY,
    allowedValues: ["tenant-id", "tenant-id-salted", "round-robin"],
    initialValue: "tenant-id",
  },
  { key: CONSUMER_INSTANCES_KEY, allowedValues: [2, 4, 8, 16], initialValue: 2 },
];
