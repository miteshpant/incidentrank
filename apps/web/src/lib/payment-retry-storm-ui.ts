import type { ControlValue } from "@incidentrank/simulator";
import {
  BACKOFF_KEY,
  CHECKOUT_INSTANCES_KEY,
  CIRCUIT_BREAKER_KEY,
  DB_CONNECTION_LIMIT_KEY,
  KAFKA_CONSUMERS_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
  TIMEOUT_SECONDS_KEY,
} from "@incidentrank/scenarios";

/**
 * UI-only display metadata: which controls belong to which architecture
 * component, and how to label a control / format its value. None of this
 * encodes scenario *behavior* — allowed values and consequences remain
 * entirely owned by the scenario definition in @incidentrank/scenarios.
 */

export const COMPONENT_CONTROL_KEYS: Record<string, string[]> = {
  "payment-service": [
    RETRIES_KEY,
    BACKOFF_KEY,
    CIRCUIT_BREAKER_KEY,
    TIMEOUT_SECONDS_KEY,
    PAYMENT_INSTANCES_KEY,
  ],
  "checkout-service": [CHECKOUT_INSTANCES_KEY],
  postgres: [DB_CONNECTION_LIMIT_KEY],
  kafka: [KAFKA_CONSUMERS_KEY],
};

export const CONTROL_LABELS: Record<string, string> = {
  [RETRIES_KEY]: "Retries",
  [BACKOFF_KEY]: "Backoff",
  [CIRCUIT_BREAKER_KEY]: "Circuit Breaker",
  [TIMEOUT_SECONDS_KEY]: "Timeout",
  [PAYMENT_INSTANCES_KEY]: "Instances",
  [CHECKOUT_INSTANCES_KEY]: "Instances",
  [DB_CONNECTION_LIMIT_KEY]: "Connection Limit",
  [KAFKA_CONSUMERS_KEY]: "Settlement Consumers",
};

export function formatControlValue(controlKey: string, value: ControlValue): string {
  if (controlKey === TIMEOUT_SECONDS_KEY) return `${value}s`;
  if (controlKey === CIRCUIT_BREAKER_KEY) return value === "on" ? "On" : "Off";
  if (controlKey === BACKOFF_KEY && typeof value === "string") {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  return String(value);
}

export const COMPONENT_LABELS: Record<string, string> = {
  "api-gateway": "API Gateway",
  "checkout-service": "Checkout Service",
  "payment-service": "Payment Service",
  "payment-provider": "External Payment Provider",
  postgres: "Postgres",
  kafka: "Kafka",
  "settlement-worker": "Settlement Worker",
};
