import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  BACKOFF_KEY,
  CHECKOUT_INSTANCES_KEY,
  CIRCUIT_BREAKER_KEY,
  DB_CONNECTION_LIMIT_KEY,
  KAFKA_CONSUMERS_KEY,
  PAYMENT_INSTANCES_KEY,
  RETRIES_KEY,
  TIMEOUT_SECONDS_KEY,
} from "./controls";

/**
 * Candidate-facing display metadata for Payment Retry Storm, migrated
 * onto the generic CandidateUIDescriptor shape so the same
 * MetricsPanel/ComponentPanel rendering code serves both built-in and
 * organization-authored scenarios. Values mirror the previously hardcoded
 * apps/web/src/lib/payment-retry-storm-ui.ts and metrics-panel.tsx
 * exactly — zero intended visual change for existing candidates.
 */
export const paymentRetryStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "checkoutSuccessRate", label: "Checkout Success", sourceStateKey: "checkoutSuccessRate", format: "percentage" },
    { key: "checkoutP99LatencyMs", label: "Checkout P99", sourceStateKey: "checkoutP99LatencyMs", format: "duration" },
    { key: "paymentProviderLatencyMs", label: "Provider Latency", sourceStateKey: "paymentProviderLatencyMs", format: "duration" },
    { key: "paymentTraffic", label: "Payment Traffic", sourceStateKey: "paymentTraffic", format: "status" },
    { key: "dbPressure", label: "DB Pressure", sourceStateKey: "dbPressure", format: "status" },
    { key: "kafkaLagMessages", label: "Kafka Lag", sourceStateKey: "kafkaLagMessages", format: "number" },
  ],
  controls: [
    { key: RETRIES_KEY, label: "Retries", componentId: "payment-service" },
    {
      key: BACKOFF_KEY,
      label: "Backoff",
      componentId: "payment-service",
      valueLabels: { none: "None", fixed: "Fixed", exponential: "Exponential" },
    },
    {
      key: CIRCUIT_BREAKER_KEY,
      label: "Circuit Breaker",
      componentId: "payment-service",
      valueLabels: { off: "Off", on: "On" },
    },
    {
      key: TIMEOUT_SECONDS_KEY,
      label: "Timeout",
      componentId: "payment-service",
      valueLabels: { "1": "1s", "2": "2s", "3": "3s", "5": "5s" },
    },
    { key: PAYMENT_INSTANCES_KEY, label: "Instances", componentId: "payment-service" },
    { key: CHECKOUT_INSTANCES_KEY, label: "Instances", componentId: "checkout-service" },
    { key: DB_CONNECTION_LIMIT_KEY, label: "Connection Limit", componentId: "postgres" },
    { key: KAFKA_CONSUMERS_KEY, label: "Settlement Consumers", componentId: "kafka" },
  ],
  components: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "checkout-service", label: "Checkout Service" },
    { id: "payment-service", label: "Payment Service" },
    { id: "payment-provider", label: "External Payment Provider" },
    { id: "postgres", label: "Postgres" },
    { id: "kafka", label: "Kafka" },
    { id: "settlement-worker", label: "Settlement Worker" },
  ],
};
