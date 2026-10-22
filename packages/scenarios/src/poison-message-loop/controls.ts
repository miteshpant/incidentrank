import type { ControlDefinition } from "@incidentrank/simulator";

export const MAX_RETRY_ATTEMPTS_KEY = "maxRetryAttempts";
export const DEAD_LETTER_QUEUE_ENABLED_KEY = "deadLetterQueueEnabled";
export const CONSUMER_CONCURRENCY_KEY = "consumerConcurrency";

export const controls: ControlDefinition[] = [
  {
    key: MAX_RETRY_ATTEMPTS_KEY,
    allowedValues: [3, 10, 50, 999_999],
    initialValue: 999_999,
  },
  {
    key: DEAD_LETTER_QUEUE_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: CONSUMER_CONCURRENCY_KEY,
    allowedValues: [2, 4, 8, 16],
    initialValue: 2,
  },
];
