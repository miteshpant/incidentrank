import type { ControlDefinition } from "@incidentrank/simulator";

export const QUERY_TIMEOUT_MS_KEY = "queryTimeoutMs";
export const FORCE_INDEX_HINT_ENABLED_KEY = "forceIndexHintEnabled";
export const CONNECTION_POOL_SIZE_KEY = "connectionPoolSize";

export const controls: ControlDefinition[] = [
  {
    key: QUERY_TIMEOUT_MS_KEY,
    allowedValues: [1_000, 5_000, 15_000, 60_000],
    initialValue: 15_000,
  },
  {
    key: FORCE_INDEX_HINT_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CONNECTION_POOL_SIZE_KEY,
    allowedValues: [20, 50, 100, 200],
    initialValue: 20,
  },
];
