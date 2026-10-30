import type { CandidateUIDescriptor } from "../candidate-ui";
import {
  INSPECT_PAYMENT_METRICS_KEY,
  INSPECT_INVENTORY_DEPLOYS_KEY,
  INSPECT_REDIS_CONNECTIONS_KEY,
  REDIS_CONNECTION_POOL_KEY,
  RESTART_PAYMENT_PODS_KEY,
  ROLLBACK_INVENTORY_DEPLOY_KEY,
} from "./controls";

/**
 * roleInIncident tagging (Phase 10F) — what each metric represents about
 * the incident, used only by the post-incident narrative
 * (buildIncidentNarrative) and by scoring.ts's own explicit measures.
 * Never read by the simulation engine, never gates visibility.
 */
export const checkoutPaymentInventoryRedisContentionCandidateUI: CandidateUIDescriptor = {
  metrics: [
    {
      key: "checkoutLatencyMs",
      label: "Checkout Latency",
      sourceStateKey: "checkoutLatencyMs",
      format: "duration",
      roleInIncident: "context",
    },
    {
      key: "checkoutErrorRate",
      label: "Checkout Error Rate",
      sourceStateKey: "checkoutErrorRate",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "paymentRetryRatePercent",
      label: "Payment Retry Rate",
      sourceStateKey: "paymentRetryRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "paymentTimeoutRatePercent",
      label: "Payment Timeout Rate",
      sourceStateKey: "paymentTimeoutRatePercent",
      format: "percentage",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "inventoryP95LatencyMs",
      label: "Inventory p95 Latency",
      sourceStateKey: "inventoryP95LatencyMs",
      format: "duration",
      roleInIncident: "downstream_symptom",
    },
    {
      key: "redisCpuPercent",
      label: "Redis CPU",
      sourceStateKey: "redisCpuPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "redisMemoryPercent",
      label: "Redis Memory",
      sourceStateKey: "redisMemoryPercent",
      format: "percentage",
      roleInIncident: "context",
    },
    {
      key: "redisConnectionUtilizationPercent",
      label: "Redis Connection Utilization",
      sourceStateKey: "redisConnectionUtilizationPercent",
      format: "percentage",
      roleInIncident: "root_cause",
    },
    {
      key: "monitoringAgentFlapCount",
      label: "Monitoring Agent Flap Count",
      sourceStateKey: "monitoringAgentFlapCount",
      format: "number",
      roleInIncident: "noise",
    },
  ],
  controls: [
    {
      key: INSPECT_PAYMENT_METRICS_KEY,
      label: "Inspect Payment Retry Metrics",
      componentId: "payment-api",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_INVENTORY_DEPLOYS_KEY,
      label: "Inspect Inventory Deployment History",
      componentId: "inventory-api",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: INSPECT_REDIS_CONNECTIONS_KEY,
      label: "Inspect Redis Connection Pool",
      componentId: "redis",
      kind: "investigation",
      valueLabels: { false: "Not inspected", true: "Inspected" },
    },
    {
      key: RESTART_PAYMENT_PODS_KEY,
      label: "Restart Payment Pods",
      componentId: "payment-api",
      kind: "remediation",
      valueLabels: { false: "Not restarted", true: "Restarted" },
    },
    {
      key: ROLLBACK_INVENTORY_DEPLOY_KEY,
      label: "Rollback Inventory Deployment",
      componentId: "inventory-api",
      kind: "remediation",
      valueLabels: { false: "Not rolled back", true: "Rolled back" },
    },
    {
      key: REDIS_CONNECTION_POOL_KEY,
      label: "Redis Connection Pool Size",
      componentId: "redis",
      kind: "remediation",
      valueLabels: { "128": "128", "256": "256", "512": "512", "1024": "1,024" },
    },
  ],
  components: [
    { id: "checkout-api", label: "Checkout API" },
    { id: "payment-api", label: "Payment API" },
    { id: "inventory-api", label: "Inventory API" },
    { id: "redis", label: "Redis" },
  ],
};
