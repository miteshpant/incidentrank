import type { ActionClassificationRule } from "@incidentrank/simulator";
import { AUTO_COMMIT_ENABLED_KEY, CONSUMER_INSTANCES_KEY, MAX_POLL_RECORDS_KEY } from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: CONSUMER_INSTANCES_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { producerSpiking: true },
    outcome: "beneficial",
  },
  {
    controlKey: AUTO_COMMIT_ENABLED_KEY,
    valueEquals: false,
    whenTriggerEquals: { producerSpiking: true },
    outcome: "beneficial",
  },
  {
    controlKey: MAX_POLL_RECORDS_KEY,
    valueAtLeast: 5_000,
    whenTriggerEquals: { slowRecordsPresent: true },
    outcome: "harmful",
  },
  {
    controlKey: AUTO_COMMIT_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { producerSpiking: true },
    outcome: "harmful",
  },
];
