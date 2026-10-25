import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * 9 nodes, 11 edges — flat (ArchitectureNode/ArchitectureEdge per
 * phase6d.4.md section 3; no groups/containers/nesting).
 *
 * Clients -> Edge/CDN -> API Fleet is the common entry path for all
 * traffic (legitimate peak-event demand — this is never a bot/abuse
 * surface). From API Fleet the request graph fans out into THREE
 * business-criticality tiers, which is the whole point of this
 * scenario's architecture:
 *
 *   1. Payment/Transaction Service -> Database — the business-critical
 *      path (purchase/checkout/transaction correctness). Must remain
 *      available "as long as safely possible" (business invariant #1).
 *   2. Cache -> Database — the shared read path EVERY tier depends on
 *      (product pages, catalog, cart reads as well as checkout reads).
 *      This is deliberately the single shared bottleneck that makes
 *      "protect the DB" and "protect checkout" two distinct, sometimes
 *      competing objectives: cache effectiveness collapsing under peak
 *      load pushes more of EVERY tier's traffic onto the same database.
 *   3. Search/Personalization Service -> Cache — the optional,
 *      explicitly sacrificial path (business invariant #2). It reads
 *      through the same shared cache (and, on a miss, the same shared
 *      database) as everything else, which is exactly why disabling it
 *      under load is a real, load-bearing lever rather than cosmetic:
 *      every unit of personalization/search traffic NOT sent is cache
 *      and DB capacity freed for checkout and catalog reads.
 *
 * API Fleet also enqueues accepted-but-deferrable work (order
 * confirmation, receipt generation, inventory reconciliation, loyalty
 * point crediting) onto the Async Queue, consumed by Async Workers, who
 * write durably back to the Database — the fourth tier (deferred, must
 * remain durable, business invariant #4), and the reason worker
 * concurrency is a genuine DB-pressure lever (pressure-transfer #3,
 * see rules.ts) rather than an isolated, independent dial.
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "clients", label: "Clients" },
    { id: "edge-cdn", label: "Edge / CDN" },
    { id: "api-fleet", label: "API Fleet" },
    { id: "payment-service", label: "Payment / Transaction Service" },
    { id: "search-service", label: "Search / Personalization Service" },
    { id: "cache", label: "Cache" },
    { id: "database", label: "Database" },
    { id: "async-queue", label: "Async Queue" },
    { id: "async-workers", label: "Async Workers" },
  ],
  edges: [
    { from: "clients", to: "edge-cdn" },
    { from: "edge-cdn", to: "api-fleet" },
    { from: "api-fleet", to: "payment-service" },
    { from: "api-fleet", to: "search-service" },
    { from: "api-fleet", to: "cache" },
    { from: "api-fleet", to: "async-queue" },
    { from: "payment-service", to: "database" },
    { from: "search-service", to: "cache" },
    { from: "cache", to: "database" },
    { from: "async-queue", to: "async-workers" },
    { from: "async-workers", to: "database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "edge-cdn": "healthy",
  "api-fleet": "healthy",
  "payment-service": "healthy",
  "search-service": "healthy",
  cache: "healthy",
  database: "healthy",
  "async-queue": "healthy",
  "async-workers": "healthy",
};
