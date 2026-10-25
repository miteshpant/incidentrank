import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

// Flat, 6-node topology — a straight line, no fan-out, no shared
// dependency. There is no "scale X -> overload Y" mechanic anywhere in
// this scenario: every node stays healthy for the entire incident. The
// only thing wrong is how much is being spent to keep it that way.
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "api", label: "API" },
    { id: "autoscaler", label: "Autoscaler" },
    { id: "worker-fleet", label: "Worker Fleet" },
    { id: "database", label: "Database" },
    { id: "object-store", label: "Object Store" },
  ],
  edges: [
    { from: "clients", to: "api" },
    { from: "api", to: "autoscaler" },
    { from: "autoscaler", to: "worker-fleet" },
    { from: "worker-fleet", to: "database" },
    { from: "worker-fleet", to: "object-store" },
  ],
};

// Every node stays healthy for the entire scenario, including the
// unsafe path — this is deliberate. The unsafe path's damage is to
// redundancy HEADROOM (a reserve that is not currently being exercised),
// never to live component health, which is exactly why it is tempting:
// nothing in the architecture view ever turns red.
export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  api: "healthy",
  autoscaler: "healthy",
  "worker-fleet": "healthy",
  database: "healthy",
  "object-store": "healthy",
};
