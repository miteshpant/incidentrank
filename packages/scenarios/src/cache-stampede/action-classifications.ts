import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CACHE_TTL_SECONDS_KEY,
  ORIGIN_CONNECTION_POOL_SIZE_KEY,
  REQUEST_COALESCING_ENABLED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: REQUEST_COALESCING_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { stampedeActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: CACHE_TTL_SECONDS_KEY,
    valueAtMost: 10,
    whenTriggerEquals: { stampedeActive: true },
    outcome: "harmful",
  },
  {
    controlKey: ORIGIN_CONNECTION_POOL_SIZE_KEY,
    valueAtLeast: 200,
    whenTriggerEquals: { stampedeActive: true },
    outcome: "neutral",
  },
];
