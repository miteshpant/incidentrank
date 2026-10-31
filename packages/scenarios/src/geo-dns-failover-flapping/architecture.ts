import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "global-clients", label: "Global Clients" },
    { id: "geo-dns", label: "GeoDNS Failover Controller" },
    { id: "health-checker", label: "Health Checker" },
    { id: "region-east", label: "Region: US-East" },
    { id: "region-west", label: "Region: US-West" },
  ],
  edges: [
    { from: "global-clients", to: "geo-dns" },
    { from: "geo-dns", to: "region-east" },
    { from: "geo-dns", to: "region-west" },
    { from: "health-checker", to: "region-east" },
    { from: "health-checker", to: "region-west" },
    { from: "health-checker", to: "geo-dns" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "global-clients": "healthy",
  "geo-dns": "healthy",
  "health-checker": "healthy",
  "region-east": "healthy",
  "region-west": "healthy",
};
