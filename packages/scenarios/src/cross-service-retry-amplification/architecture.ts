import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

// Flat architecture per phase6dsupport.md section 3 — six nodes, five
// edges, a single linear chain. Every node sits on the one path a
// customer request actually traverses; there is no fan-out, no second
// path, no shared dependency to misread. Readability is addressed
// entirely through node/edge count and labeling, not through any new
// architecture primitive.
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "client", label: "Client" },
    { id: "gateway", label: "Gateway" },
    { id: "service-a", label: "Service A" },
    { id: "service-b", label: "Service B" },
    { id: "service-c", label: "Service C" },
    { id: "external-provider", label: "External Provider" },
  ],
  edges: [
    { from: "client", to: "gateway" },
    { from: "gateway", to: "service-a" },
    { from: "service-a", to: "service-b" },
    { from: "service-b", to: "service-c" },
    { from: "service-c", to: "external-provider" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  client: "healthy",
  gateway: "healthy",
  "service-a": "healthy",
  "service-b": "healthy",
  "service-c": "healthy",
  "external-provider": "healthy",
};
