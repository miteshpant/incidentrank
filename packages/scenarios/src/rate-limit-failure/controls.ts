import type { ControlDefinition } from "@incidentrank/simulator";

export const RETRY_BACKOFF_STRATEGY_KEY = "retryBackoffStrategy";
export const CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY = "clientSideRateLimitEnabled";
export const REQUEST_CONCURRENCY_KEY = "requestConcurrency";

export const controls: ControlDefinition[] = [
  {
    key: RETRY_BACKOFF_STRATEGY_KEY,
    allowedValues: ["none", "fixed-delay", "exponential-with-jitter"],
    initialValue: "none",
  },
  {
    key: CLIENT_SIDE_RATE_LIMIT_ENABLED_KEY,
    allowedValues: [false, true],
    initialValue: false,
  },
  {
    key: REQUEST_CONCURRENCY_KEY,
    allowedValues: [4, 8, 16, 32],
    initialValue: 8,
  },
];
