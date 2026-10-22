import type { ActionClassificationRule } from "@incidentrank/simulator";
import {
  CONSUMER_CONCURRENCY_KEY,
  DEAD_LETTER_QUEUE_ENABLED_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
} from "./controls";

export const actionClassifications: ActionClassificationRule[] = [
  {
    controlKey: MAX_RETRY_ATTEMPTS_KEY,
    valueAtMost: 10,
    whenTriggerEquals: { poisonMessagePresent: true },
    outcome: "beneficial",
  },
  {
    controlKey: DEAD_LETTER_QUEUE_ENABLED_KEY,
    valueEquals: true,
    whenTriggerEquals: { poisonMessagePresent: true },
    outcome: "beneficial",
  },
  {
    controlKey: CONSUMER_CONCURRENCY_KEY,
    valueAtLeast: 8,
    whenTriggerEquals: { poisonMessagePresent: true },
    outcome: "harmful",
  },
];
