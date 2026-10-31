import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-traffic-manager", label: "Global Traffic Manager" },
    { id: "eu-region", label: "EU Region (eu-west-1)" },
    { id: "us-failover-region", label: "US Failover Region (us-east-1)" },
    { id: "compliance-gateway", label: "Data Residency Compliance Gateway" },
  ],
  edges: [
    { from: "global-traffic-manager", to: "eu-region" },
    { from: "global-traffic-manager", to: "us-failover-region" },
    { from: "global-traffic-manager", to: "compliance-gateway" },
    { from: "compliance-gateway", to: "eu-region" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-traffic-manager": "healthy",
  "eu-region": "healthy",
  "us-failover-region": "healthy",
  "compliance-gateway": "healthy",
};
