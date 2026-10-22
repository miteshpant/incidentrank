import type { ControlDefinition } from "@incidentrank/simulator";

export const ROLLBACK_TO_PREVIOUS_VERSION_KEY = "rollbackToPreviousVersion";
export const CANARY_TRAFFIC_PERCENT_KEY = "canaryTrafficPercent";
export const DEBUG_LOGGING_ENABLED_KEY = "debugLoggingEnabled";

export const controls: ControlDefinition[] = [
  {
    key: ROLLBACK_TO_PREVIOUS_VERSION_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CANARY_TRAFFIC_PERCENT_KEY,
    allowedValues: [0, 10, 50, 100],
    initialValue: 100,
  },
  {
    key: DEBUG_LOGGING_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
];
