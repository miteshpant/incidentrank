import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // Per-partition request rate (requests/sec). Partition A is the one
  // that becomes hot; B/C/D are the candidate-visible "everyone else"
  // baseline the candidate can compare against.
  partitionARequestRate: 400,
  partitionBRequestRate: 380,
  partitionCRequestRate: 390,
  partitionDRequestRate: 370,

  // Partition A's own latency/queue — the primary symptom.
  partitionALatencyMs: 25,
  partitionAQueueDepth: 0,

  // Partition B's own latency/queue — stays near-identical to A's
  // baseline UNTIL a shard split is in flight, at which point it is the
  // secondary subsystem that visibly absorbs migration pressure.
  partitionBLatencyMs: 24,
  partitionBQueueDepth: 0,

  // Share of total platform traffic the top handful of tenants account
  // for on Partition A — the direct, candidate-visible evidence of
  // concentration (vs. an evenly spread baseline).
  hotTenantTrafficSharePct: 8,

  globalApiLatencyMs: 45,
  throttledRequestRatePerSec: 0,

  partitionAStatus: "normal",

  // Generic string-state field (same precedent as Kafka Partition Skew's
  // orderingMode / Missing Database Index's orderHistoryQueryHealth):
  // distinguishes WHY Partition A looks healthy. "unresolved" = no real
  // mitigation yet. "rebalanced" = the partitioning strategy itself was
  // fixed (salted hash), the durable, tenant-equitable repair.
  // "round-robin" = traffic is spread evenly but per-tenant data
  // locality/ordering is sacrificed. "hot-tenant-constrained" = the
  // platform is protected by throttling the identified hot tenants
  // specifically, which is safe for everyone else but degrades those
  // tenants' own throughput.
  partitionRebalanceMode: "unresolved",
};
