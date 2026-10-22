import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
  REQUEST_CONCURRENCY_KEY,
  RETRY_BACKOFF_STRATEGY_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { rateLimited: true },
    outcome: "beneficial",
  },
  {
    controlKey: RETRY_BACKOFF_STRATEGY_KEY,
    valueEquals: "exponential-with-jitter",
    whenTriggerEquals: { rateLimited: true },
    outcome: "beneficial",
  },
  {
    controlKey: REQUEST_CONCURRENCY_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { rateLimited: true },
    outcome: "harmful",
  },
];
