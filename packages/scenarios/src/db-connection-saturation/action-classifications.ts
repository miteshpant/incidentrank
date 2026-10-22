import type { ActionClassificationRule } from "@incidentrank/simulator";
import { POOL_SIZE_KEY, QUERY_TIMEOUT_MS_KEY, READ_REPLICA_ENABLED_KEY } from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: POOL_SIZE_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { saturating: true },
    outcome: "beneficial",
  },
  {
    controlKey: READ_REPLICA_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { saturating: true },
    outcome: "beneficial",
  },
  {
    controlKey: POOL_SIZE_KEY,
    valueAtMost: 50,
    whenTriggerEquals: { saturating: true },
    outcome: "harmful",
  },
  {
    controlKey: QUERY_TIMEOUT_MS_KEY,
    valueAtLeast: 15_000,
    whenTriggerEquals: { saturating: true },
    outcome: "harmful",
  },
];
