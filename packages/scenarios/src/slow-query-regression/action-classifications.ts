import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONNECTION_POOL_SIZE_KEY,
  FORCE_INDEX_HINT_ENABLED_KEY,
  QUERY_TIMEOUT_MS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: FORCE_INDEX_HINT_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { regressionActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: CONNECTION_POOL_SIZE_KEY,
    valueAtLeast: 100,
    whenTriggerEquals: { regressionActive: true },
    outcome: "harmful",
  },
  {
    controlKey: QUERY_TIMEOUT_MS_KEY,
    valueAtMost: 1_000,
    whenTriggerEquals: { regressionActive: true },
    outcome: "harmful",
  },
];
