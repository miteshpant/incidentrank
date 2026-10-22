import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  BACKOFF_KEY,
  CIRCUIT_BREAKER_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
} from "./controls";

/**
 * Authored beneficial/harmful/neutral classification for scoring-input
 * bookkeeping only. Never used to decide resolution/failure.
 */
export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: RETRIES_KEY,
    valueAtMost: 1,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
  },
  {
    controlKey: RETRIES_KEY,
    valueAtLeast: 5,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
  },
  {
    controlKey: BACKOFF_KEY,
    valueEquals: "exponential",
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
  },
  {
    controlKey: CIRCUIT_BREAKER_KEY,
    valueEquals: "on",
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
  },
  {
    controlKey: PAYMENT_INSTANCES_KEY,
    valueAtLeast: 16,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
  },
];
