import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  API_GATEWAY_INSTANCES_KEY,
  CLIENT_JITTER_ENABLED_KEY,
  REQUEST_QUEUEING_ENABLED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: CLIENT_JITTER_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { synchronizedSpike: true },
    outcome: "beneficial",
  },
  {
    controlKey: API_GATEWAY_INSTANCES_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { synchronizedSpike: true },
    outcome: "harmful",
  },
  {
    controlKey: REQUEST_QUEUEING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { synchronizedSpike: true },
    outcome: "neutral",
  },
];
