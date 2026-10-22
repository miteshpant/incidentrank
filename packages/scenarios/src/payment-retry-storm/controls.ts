import type { ControlDefinition } from "@incidentrank/simulator";

export const RETRIES_KEY = "retries";
export const BACKOFF_KEY = "backoff";
export const CIRCUIT_BREAKER_KEY = "circuitBreaker";
export const TIMEOUT_SECONDS_KEY = "timeoutSeconds";
export const PAYMENT_INSTANCES_KEY = "paymentInstances";
export const CHECKOUT_INSTANCES_KEY = "checkoutInstances";
export const DB_CONNECTION_LIMIT_KEY = "dbConnectionLimit";
export const KAFKA_CONSUMERS_KEY = "kafkaConsumers";

export const controls: ControlDefinition[] = [
  { key: RETRIES_KEY, allowedValues: [0, 1, 3, 5], initialValue: 3 },
  {
    key: BACKOFF_KEY,
    allowedValues: ["none", "fixed", "exponential"],
    initialValue: "none",
  },
  {
    key: CIRCUIT_BREAKER_KEY,
    allowedValues: ["off", "on"],
    initialValue: "off",
  },
  {
    key: TIMEOUT_SECONDS_KEY,
    allowedValues: [1, 2, 3, 5],
    initialValue: 2,
  },
  {
    key: PAYMENT_INSTANCES_KEY,
    allowedValues: [4, 8, 12, 16, 24],
    initialValue: 8,
  },
  {
    key: CHECKOUT_INSTANCES_KEY,
    allowedValues: [4, 8, 12, 16, 24],
    initialValue: 8,
  },
  {
    key: DB_CONNECTION_LIMIT_KEY,
    allowedValues: [250, 500, 750, 1000],
    initialValue: 500,
  },
  {
    key: KAFKA_CONSUMERS_KEY,
    allowedValues: [4, 8, 12, 16, 24],
    initialValue: 8,
  },
];
