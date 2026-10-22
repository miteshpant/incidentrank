import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_SERVICE_INSTANCES_KEY,
  CONFIG_CHANGE_FREEZE_ENABLED_KEY,
  CONFIG_REVERT_ENABLED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: CONFIG_REVERT_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { badConfigActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: CONFIG_CHANGE_FREEZE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { badConfigActive: true },
    outcome: "neutral",
  },
  {
    controlKey: API_SERVICE_INSTANCES_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { badConfigActive: true },
    outcome: "harmful",
  },
];
