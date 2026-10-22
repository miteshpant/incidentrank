import type { ControlDefinition } from "@incidentrank/simulator";

export const MANUAL_RESTART_TRIGGERED_KEY = "manualRestartTriggered";
export const MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY = "memoryLimitAutoRestartEnabled";
export const CACHE_EVICTION_POLICY_ENABLED_KEY = "cacheEvictionPolicyEnabled";

export const controls: ControlDefinition[] = [
  {
    key: MANUAL_RESTART_TRIGGERED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: MEMORY_LIMIT_AUTO_RESTART_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CACHE_EVICTION_POLICY_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
