import type { ArchitectureDefinition, ComponentHealth } from "@incidentrank/simulator";

/**
 * Deliberately flat, 10-node architecture (phase6d.4.md section 3 — use
 * the existing flat ArchitectureNode/ArchitectureEdge representation
 * first; no containers, no subsystem grouping).
 *
 * NODE CHOICES (every node is load-bearing for the root/amplifier/
 * restoration judgment this scenario requires):
 *
 *   product-a, product-b, product-c — three independent product
 *     surfaces sharing the same platform. All three are genuinely
 *     affected once the incident starts, but in three DIFFERENT ways:
 *     Product B is the loud amplifier (its own retry policy multiplies
 *     load back onto the shared platform), Product A is a quiet
 *     starver (its long-held connections slowly exhaust the shared DB's
 *     connection budget with no dramatic error-rate spike of its own),
 *     and Product C is the mostly-innocent bystander whose only real
 *     exposure is shared-platform capacity, not its own behavior. A
 *     candidate who only watches "which product's dashboard is
 *     reddest" sees Product B first — that is the trap.
 *
 *   shared-gateway — the single ingress every product's traffic passes
 *     through. This is where product-specific isolation/admission
 *     control is actually enforced, and where Product B's retry
 *     amplification is structurally visible as disproportionate request
 *     volume from one product.
 *
 *   shared-identity — the TRUE ROOT: token-validation latency degrades
 *     here first, before anything else moves. Every other symptom in
 *     this incident is downstream of this one node degrading.
 *
 *   shared-cache — sits between the gateway and Shared Identity,
 *     absorbing a meaningful fraction of token-validation lookups under
 *     normal conditions. This is the genuine "protect the root
 *     dependency first" lever: a cache-assist policy change here
 *     measurably reduces load actually reaching Shared Identity,
 *     independent of which product is isolated. Without this node, the
 *     only way to protect Shared Identity would be to isolate products
 *     (an amplifier-side lever only) — this node is required so
 *     "protect the shared dependency" is a real, distinct action from
 *     "isolate the amplifier," per the spec's required strong-path
 *     shape.
 *
 *   shared-metadata — per-product configuration/entitlement reads that
 *     depend on identity context. Models the "identity correctness must
 *     be preserved" invariant: metadata reads fail closed, never
 *     open, when identity cannot be verified.
 *
 *   shared-messaging — the asynchronous fan-out layer products enqueue
 *     work onto downstream of a request. Its consumer backlog is one of
 *     the two independently-paced recovery-lag subsystems (the other is
 *     Shared Database connection pressure) — it drains on a materially
 *     different real-elapsed-time schedule than DB connection pressure,
 *     which is the required "multiple subsystem recovery lags, modeled
 *     independently" mechanic.
 *
 *   async-workers — the consumer fleet draining Shared Messaging's
 *     backlog. Modeled as its own node (not folded into
 *     shared-messaging) because its concurrency is an independent,
 *     candidate-controlled lever or the messaging backlog can never be
 *     observed draining at all — it is the thing that actually does the
 *     draining, not merely a property of the queue.
 *
 *   shared-database — the deepest shared layer. Its connection budget
 *     is the second independently-paced recovery-lag subsystem, and the
 *     node whose durability must never be traded away for availability
 *     (business invariant #3).
 *
 * This is 10 nodes: three products, five shared layers, plus the two
 * load-bearing additions (shared-cache, async-workers) needed to make
 * "which shared dependency to protect first" and "drain the secondary
 * backlog" real, independently-actionable mechanics rather than labels
 * on a single Shared Identity node. No per-product traffic nodes were
 * added beyond the three products themselves — product-level traffic
 * shape is expressed as metrics/controls on the existing product nodes,
 * not as additional architecture nodes, keeping the diagram flat and
 * readable (see architectureReadability in the authoring report).
 */
export const architecture: ArchitectureDefinition = {
  nodes: [
    { id: "product-a", label: "Product A" },
    { id: "product-b", label: "Product B" },
    { id: "product-c", label: "Product C" },
    { id: "shared-gateway", label: "Shared Gateway" },
    { id: "shared-cache", label: "Shared Cache" },
    { id: "shared-identity", label: "Shared Identity" },
    { id: "shared-metadata", label: "Shared Metadata" },
    { id: "shared-messaging", label: "Shared Messaging" },
    { id: "async-workers", label: "Async Workers" },
    { id: "shared-database", label: "Shared Database" },
  ],
  edges: [
    { from: "product-a", to: "shared-gateway" },
    { from: "product-b", to: "shared-gateway" },
    { from: "product-c", to: "shared-gateway" },
    { from: "shared-gateway", to: "shared-cache" },
    { from: "shared-cache", to: "shared-identity" },
    { from: "shared-identity", to: "shared-metadata" },
    { from: "shared-gateway", to: "shared-messaging" },
    { from: "shared-messaging", to: "async-workers" },
    { from: "shared-metadata", to: "shared-database" },
    { from: "async-workers", to: "shared-database" },
  ],
};

export const healthyComponentHealth: Record<string, ComponentHealth> = {
  "product-a": "healthy",
  "product-b": "healthy",
  "product-c": "healthy",
  "shared-gateway": "healthy",
  "shared-cache": "healthy",
  "shared-identity": "healthy",
  "shared-metadata": "healthy",
  "shared-messaging": "healthy",
  "async-workers": "healthy",
  "shared-database": "healthy",
};
