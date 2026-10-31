import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Orders Service (the producing team) emits an `order.updated` event onto
 * a shared event bus. Three independently-owned consumer pipelines read
 * the exact same stream and each decode it their own way: Billing,
 * Analytics, and Fraud Detection. There is no fan-in, no shared consumer
 * code — each pipeline's breakage (or non-breakage) depends entirely on
 * how defensively THAT team happened to write their own deserializer
 * against a field Orders never agreed to keep stable.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "orders-service", label: "Orders Service (producer)" },
    { id: "event-bus", label: "Event Bus" },
    { id: "billing-pipeline", label: "Billing Pipeline" },
    { id: "analytics-warehouse", label: "Analytics Warehouse" },
    { id: "fraud-detection", label: "Fraud Detection Pipeline" },
  ],
  edges: [
    { from: "orders-service", to: "event-bus" },
    { from: "event-bus", to: "billing-pipeline" },
    { from: "event-bus", to: "analytics-warehouse" },
    { from: "event-bus", to: "fraud-detection" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "orders-service": "healthy",
  "event-bus": "healthy",
  "billing-pipeline": "healthy",
  "analytics-warehouse": "healthy",
  "fraud-detection": "healthy",
};
