import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Flat architecture per phase6dsupport.md section 3 — nine logical nodes,
 * no region containers/subsystem groups/nested architecture. The
 * synchronous critical path IS the edge list below: Web/Mobile calls the
 * Checkout Orchestrator, which calls every one of Cart/Pricing/Inventory/
 * Promotions/Tax/Payment synchronously before handing off to Order
 * Service. There is no dedicated "critical path" node type — the
 * candidate must read the edges themselves to see that all six downstream
 * calls sit on one synchronous request, which is exactly the reasoning
 * this scenario is designed to require (see architectureReadability in
 * the author's report: flat labels + edges are sufficient here because
 * the orchestrator's fan-out IS the critical path, with nothing hidden a
 * better label could not already convey).
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "web-mobile", label: "Web / Mobile" },
    { id: "checkout-orchestrator", label: "Checkout Orchestrator" },
    { id: "cart", label: "Cart" },
    { id: "pricing", label: "Pricing" },
    { id: "inventory", label: "Inventory" },
    { id: "promotions", label: "Promotions" },
    { id: "tax", label: "Tax" },
    { id: "payment", label: "Payment" },
    { id: "order-service", label: "Order Service" },
  ],
  edges: [
    { from: "web-mobile", to: "checkout-orchestrator" },
    { from: "checkout-orchestrator", to: "cart" },
    { from: "checkout-orchestrator", to: "pricing" },
    { from: "checkout-orchestrator", to: "inventory" },
    { from: "checkout-orchestrator", to: "promotions" },
    { from: "checkout-orchestrator", to: "tax" },
    { from: "checkout-orchestrator", to: "payment" },
    { from: "checkout-orchestrator", to: "order-service" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "web-mobile": "healthy",
  "checkout-orchestrator": "healthy",
  cart: "healthy",
  pricing: "healthy",
  inventory: "healthy",
  promotions: "healthy",
  tax: "healthy",
  payment: "healthy",
  "order-service": "healthy",
};
