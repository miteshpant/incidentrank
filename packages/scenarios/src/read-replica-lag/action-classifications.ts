import type { ActionClassificationRule } from "@incidentrank/simulator";
import { READ_ROUTING_MODE_KEY, REPLICATION_BATCH_SIZE_KEY, WRITE_THROTTLE_ENABLED_KEY } from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: READ_ROUTING_MODE_KEY,
    valueEquals: "primary-for-recent-writes",
    whenTriggerEquals: { writeBurstActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: READ_ROUTING_MODE_KEY,
    valueEquals: "always-primary",
    whenTriggerEquals: { writeBurstActive: true },
    outcome: "harmful",
  },
  {
    controlKey: REPLICATION_BATCH_SIZE_KEY,
    valueEquals: "large",
    whenTriggerEquals: { writeBurstActive: true },
    outcome: "harmful",
  },
  {
    controlKey: WRITE_THROTTLE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { writeBurstActive: true },
    outcome: "neutral",
  },
];
