import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  DEADLOCK_RETRY_POLICY_KEY,
  RETRY_BACKOFF_KEY,
  SERVICE_CONCURRENCY_KEY,
  TRANSACTION_LOCK_ORDERING_KEY,
  TRANSACTION_SCOPE_KEY,
  WRITE_SERIALIZATION_KEY,
} from "./controls";

export const deadlockStormCandidateUI: CandidateUIDescriptor = {
  metrics: [
    { key: "deadlocksPerSec", label: "Deadlocks / sec", sourceStateKey: "deadlocksPerSec", format: "number" },
    { key: "transactionRetries", label: "Transaction Retries", sourceStateKey: "transactionRetries", format: "number" },
    { key: "lockWaitTimeMs", label: "Lock Wait Time", sourceStateKey: "lockWaitTimeMs", format: "duration" },
    { key: "checkoutFailureRate", label: "Checkout Failure Rate", sourceStateKey: "checkoutFailureRate", format: "percentage" },
    { key: "inventoryUpdateLatencyMs", label: "Inventory Update Latency", sourceStateKey: "inventoryUpdateLatencyMs", format: "duration" },
    { key: "dbConnectionsInUse", label: "DB Connections In Use", sourceStateKey: "dbConnectionsInUse", format: "number" },
    { key: "dbStatus", label: "Database Status", sourceStateKey: "dbStatus", format: "status" },
  ],
  controls: [
    {
      key: TRANSACTION_LOCK_ORDERING_KEY,
      label: "Transaction Lock Ordering",
      componentId: "postgresql",
      valueLabels: { legacy: "Legacy (per-service)", canonical: "Canonical (consistent order)" },
    },
    {
      key: DEADLOCK_RETRY_POLICY_KEY,
      label: "Deadlock Retry Policy",
      componentId: "order-service",
      valueLabels: { off: "Off", bounded: "Bounded", aggressive: "Aggressive" },
    },
    {
      key: RETRY_BACKOFF_KEY,
      label: "Retry Backoff",
      componentId: "order-service",
      valueLabels: { fixed: "Fixed Interval", exponential: "Exponential" },
    },
    {
      key: TRANSACTION_SCOPE_KEY,
      label: "Transaction Scope",
      componentId: "inventory-service",
      valueLabels: { broad: "Broad", narrow: "Narrow" },
    },
    {
      key: SERVICE_CONCURRENCY_KEY,
      label: "Service Concurrency",
      componentId: "checkout",
    },
    {
      key: WRITE_SERIALIZATION_KEY,
      label: "Temporary Write Serialization",
      componentId: "postgresql",
      valueLabels: { false: "Off", true: "On" },
    },
  ],
  components: [
    { id: "checkout", label: "Checkout" },
    { id: "order-service", label: "Order Service" },
    { id: "postgresql", label: "PostgreSQL" },
    { id: "inventory-service", label: "Inventory Service" },
  ],
};
