import type { ControlDefinition } from "@incidentrank/simulator";

export const CACHE_TTL_SECONDS_KEY = "cacheTtlSeconds";
export const REQUEST_COALESCING_ENABLED_KEY = "requestCoalescingEnabled";
export const ORIGIN_CONNECTION_POOL_SIZE_KEY = "originConnectionPoolSize";

export const controls: ControlDefinition[] = [
  { key: CACHE_TTL_SECONDS_KEY, allowedValues: [10, 60, 300, 900], initialValue: 60 },
  {
    key: REQUEST_COALESCING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: ORIGIN_CONNECTION_POOL_SIZE_KEY,
    allowedValues: [20, 50, 100, 200],
    initialValue: 20,
  },
];
