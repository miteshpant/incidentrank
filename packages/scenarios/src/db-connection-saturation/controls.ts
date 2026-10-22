import type { ControlDefinition } from "@incidentrank/simulator";

export const POOL_SIZE_KEY = "poolSize";
export const QUERY_TIMEOUT_MS_KEY = "queryTimeoutMs";
export const READ_REPLICA_ENABLED_KEY = "readReplicaEnabled";

export const controls: ControlDefinition[] = [
  { key: POOL_SIZE_KEY, allowedValues: [20, 50, 100, 200], initialValue: 20 },
  {
    key: QUERY_TIMEOUT_MS_KEY,
    allowedValues: [500, 1_000, 5_000, 15_000],
    initialValue: 1_000,
  },
  {
    key: READ_REPLICA_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
