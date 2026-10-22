import type { ControlDefinition } from "@incidentrank/simulator";

export const CONFIG_REVERT_ENABLED_KEY = "configRevertEnabled";
export const API_SERVICE_INSTANCES_KEY = "apiServiceInstances";
export const CONFIG_CHANGE_FREEZE_ENABLED_KEY = "configChangeFreezeEnabled";

export const controls: ControlDefinition[] = [
  { key: CONFIG_REVERT_ENABLED_KEY, allowedValues: [false, true], initialValue: false },
  { key: API_SERVICE_INSTANCES_KEY, allowedValues: [2, 4, 8, 16], initialValue: 2 },
  { key: CONFIG_CHANGE_FREEZE_ENABLED_KEY, allowedValues: [false, true], initialValue: false },
];
