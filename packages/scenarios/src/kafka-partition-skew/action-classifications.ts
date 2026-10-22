import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONSUMER_INSTANCES_KEY,
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: PARTITION_KEY_STRATEGY_KEY,
    valueEquals: "tenant-id-salted",
    whenTriggerEquals: { skewActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: PARTITION_COUNT_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { skewActive: true },
    outcome: "beneficial",
  },
  {
    // The central teaching point: scaling consumer count while the key
    // strategy is still unsalted does nothing for the hot partition and
    // wastes money on idle consumers.
    controlKey: CONSUMER_INSTANCES_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { skewActive: true },
    outcome: "harmful",
  },
];
