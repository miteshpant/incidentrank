import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  REQUEST_QUEUE_DEPTH_LIMIT_KEY,
  ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
  UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: ROOT_SERVICE_CIRCUIT_BREAKER_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { rootFailureActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: REQUEST_QUEUE_DEPTH_LIMIT_KEY,
    valueAtMost: 1_000,
    whenTriggerEquals: { rootFailureActive: true },
    outcome: "beneficial",
  },
  {
    controlKey: UPSTREAM_SERVICE_RESTART_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { rootFailureActive: true },
    outcome: "harmful",
  },
];
