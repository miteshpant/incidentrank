import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "cron-scheduler", label: "Cron Scheduler" },
    { id: "reconciliation-job", label: "Nightly Reconciliation Job" },
    { id: "source-orders-table", label: "Source Orders Table" },
    { id: "daily-metrics-table", label: "Daily Metrics Table" },
  ],
  edges: [
    { from: "cron-scheduler", to: "reconciliation-job" },
    { from: "reconciliation-job", to: "source-orders-table" },
    { from: "reconciliation-job", to: "daily-metrics-table" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "cron-scheduler": "healthy",
  "reconciliation-job": "healthy",
  "source-orders-table": "healthy",
  "daily-metrics-table": "healthy",
};
