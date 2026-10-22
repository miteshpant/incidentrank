import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  MAX_INSTANCE_COUNT_KEY,
  SCALE_UP_COOLDOWN_SECONDS_KEY,
  SCALE_UP_THRESHOLD_PERCENT_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: MAX_INSTANCE_COUNT_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "beneficial",
  },
  {
    controlKey: MAX_INSTANCE_COUNT_KEY,
    valueAtMost: 4,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "harmful",
  },
  {
    controlKey: SCALE_UP_THRESHOLD_PERCENT_KEY,
    valueAtMost: 70,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "beneficial",
  },
  {
    controlKey: SCALE_UP_COOLDOWN_SECONDS_KEY,
    valueAtMost: 60,
    whenTriggerEquals: { trafficSpiking: true },
    outcome: "neutral",
  },
];
