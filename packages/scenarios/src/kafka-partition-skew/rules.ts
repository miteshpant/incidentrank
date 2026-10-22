import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CONSUMER_INSTANCES_KEY,
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "healthy",
  "hot-partition": "healthy",
  "consumer-group": "healthy",
  "downstream-processor": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "degraded",
  "hot-partition": "degraded",
  "consumer-group": "healthy",
  "downstream-processor": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "degraded",
  "hot-partition": "critical",
  "consumer-group": "degraded",
  "downstream-processor": "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "healthy",
  "hot-partition": "healthy",
  "consumer-group": "healthy",
  "downstream-processor": "healthy",
};

/**
 * Authored rule table for Kafka Partition Skew, ordered most-specific-first.
 * The centerpiece teaching point: scaling consumerInstances beyond the
 * current partition count does nothing for the hot partition specifically
 * (Kafka assigns at most one consumer per partition), even though it
 * "obviously" fixed uniform backpressure in Kafka Consumer Lag. The real
 * fix is spreading the hot key across partitions (salting) and/or
 * increasing partition count alongside it — never consumer count alone.
 */
export const skewRules: Rule[] = [
  // ── Harmful: consumer instances scaled up a lot while the key strategy
  // is still unsalted ("tenant-id") — the hot partition's lag is
  // untouched (one consumer still owns that one partition regardless of
  // how many total consumers exist), while most of the new consumers sit
  // idle. Checked first/most-specific: this trap is reachable regardless
  // of partitionCount, since the problem is the KEY, not the count alone.
  {
    id: "scaled-consumers-still-skewed-harmful",
    when: {
      triggerEquals: { skewActive: true },
      controlAtLeast: { [CONSUMER_INSTANCES_KEY]: 8 },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "tenant-id" },
    },
    incidentState: "wasted-scaling",
    values: {
      hotPartitionLagMessages: 7_200,
      aggregateConsumerUtilization: 12,
      hotPartitionLatencyMs: 3_600,
      idleConsumerCount: 6,
      partitionStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: the hot key is salted (spread across partitions)
  // AND there are enough partitions to actually absorb the split load.
  {
    id: "salted-key-with-enough-partitions-recovery",
    when: {
      triggerEquals: { skewActive: true },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "tenant-id-salted" },
      controlAtLeast: { [PARTITION_COUNT_KEY]: 8 },
    },
    incidentState: "recovering",
    values: {
      hotPartitionLagMessages: 80,
      aggregateConsumerUtilization: 68,
      hotPartitionLatencyMs: 90,
      idleConsumerCount: 0,
      partitionStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Tradeoff-laden alternative: round-robin keying also spreads load
  // evenly and drains the hot-partition lag, but breaks the per-tenant
  // ordering guarantee downstream consumers may depend on — reflected as
  // a distinct incidentState, not a hard failure.
  {
    id: "round-robin-recovers-with-ordering-tradeoff",
    when: {
      triggerEquals: { skewActive: true },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "round-robin" },
    },
    incidentState: "recovered-ordering-risk",
    values: {
      hotPartitionLagMessages: 120,
      aggregateConsumerUtilization: 62,
      hotPartitionLatencyMs: 110,
      idleConsumerCount: 0,
      partitionStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: salted key, but not enough partitions to
  // fully absorb the now-spread load.
  {
    id: "salted-key-insufficient-partitions",
    when: {
      triggerEquals: { skewActive: true },
      controlEquals: { [PARTITION_KEY_STRATEGY_KEY]: "tenant-id-salted" },
    },
    incidentState: "degraded",
    values: {
      hotPartitionLagMessages: 1_800,
      aggregateConsumerUtilization: 50,
      hotPartitionLatencyMs: 700,
      idleConsumerCount: 1,
      partitionStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Smaller partial: more partitions added, but the key strategy is
  // still unsalted — the hot tenant's messages still land on one
  // partition, though overall topic throughput improves slightly.
  {
    id: "more-partitions-still-skewed",
    when: {
      triggerEquals: { skewActive: true },
      controlAtLeast: { [PARTITION_COUNT_KEY]: 16 },
    },
    incidentState: "degraded",
    values: {
      hotPartitionLagMessages: 6_000,
      aggregateConsumerUtilization: 30,
      hotPartitionLatencyMs: 3_000,
      idleConsumerCount: 0,
      partitionStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Baseline critical: skew active, no mitigation. Aggregate
  // utilization looks moderate (35%) — intentionally NOT alarming on its
  // own — while the hot partition is already critical.
  {
    id: "skew-critical-default",
    when: { triggerEquals: { skewActive: true } },
    incidentState: "skewed",
    values: {
      hotPartitionLagMessages: 7_000,
      aggregateConsumerUtilization: 35,
      hotPartitionLatencyMs: 3_500,
      idleConsumerCount: 1,
      partitionStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no skew active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      hotPartitionLagMessages: 150,
      aggregateConsumerUtilization: 45,
      hotPartitionLatencyMs: 120,
      idleConsumerCount: 0,
      partitionStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
