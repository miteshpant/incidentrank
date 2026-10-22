import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CANARY_TRAFFIC_PERCENT_KEY,
  DEBUG_LOGGING_ENABLED_KEY,
  ROLLBACK_TO_PREVIOUS_VERSION_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: ROLLBACK_TO_PREVIOUS_VERSION_KEY,
    valueEquals: true,
    whenTriggerEquals: { regressionActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: CANARY_TRAFFIC_PERCENT_KEY,
    valueAtMost: 0,
    whenTriggerEquals: { regressionActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: DEBUG_LOGGING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { regressionActive: true },
    outcome: "harmful",
  },
];
