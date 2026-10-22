import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import { AUTO_COMMIT_ENABLED_KEY, CONSUMER_INSTANCES_KEY, MAX_POLL_RECORDS_KEY } from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "healthy",
  "consumer-group": "healthy",
  "downstream-api": "healthy",
  "dead-letter-queue": "healthy",
};

const degradedHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "degraded",
  "consumer-group": "degraded",
  "downstream-api": "healthy",
  "dead-letter-queue": "healthy",
};

const criticalHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "critical",
  "consumer-group": "critical",
  "downstream-api": "degraded",
  "dead-letter-queue": "degraded",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  "producer-service": "healthy",
  "kafka-topic": "healthy",
  "consumer-group": "healthy",
  "downstream-api": "healthy",
  "dead-letter-queue": "healthy",
};

/**
 * Authored rule table for Kafka Consumer Lag, ordered most-specific-first.
 * Encodes a clean-recovery path (scale consumers, keep auto-commit off),
 * a data-integrity-risk partial path (scale consumers but leave
 * auto-commit on), a harmful path (raising maxPollRecords once slow
 * records are present causes poll-timeout rebalances, making lag worse
 * instead of better), and a baseline-critical default.
 */
export const lagRules: Rule[] = [
  // ── Harmful: raising maxPollRecords while slow records are present —
  // each poll batch now takes too long, the consumer misses its
  // heartbeat, and the group rebalances repeatedly instead of draining.
  // Checked first/most-specific: this failure mode dominates regardless
  // of how many consumer instances are running, since every instance
  // independently hits the same poll-timeout problem.
  {
    id: "large-batches-with-slow-records-harmful",
    when: {
      triggerEquals: { producerSpiking: true, slowRecordsPresent: true },
      controlAtLeast: { [MAX_POLL_RECORDS_KEY]: 5_000 },
    },
    incidentState: "rebalancing",
    values: {
      consumerLagMessages: 9_500,
      processingLatencyMs: 4_200,
      errorRate: 18,
      deadLetterCount: 40,
      consumerStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Good recovery: enough consumers, auto-commit off, even once slow
  // records are present — larger parallelism absorbs the slow lookups
  // (as long as maxPollRecords wasn't also raised into the harmful range
  // above).
  {
    id: "scaled-consumers-safe-commit",
    when: {
      triggerEquals: { producerSpiking: true },
      controlAtLeast: { [CONSUMER_INSTANCES_KEY]: 8 },
      controlEquals: { [AUTO_COMMIT_ENABLED_KEY]: false },
    },
    incidentState: "recovering",
    values: {
      consumerLagMessages: 150,
      processingLatencyMs: 180,
      errorRate: 0.2,
      deadLetterCount: 0,
      consumerStatus: "normal",
    },
    componentHealth: recoveringHealth,
  },

  // ── Data-integrity risk: enough consumers to drain lag, but
  // auto-commit stays on — offsets commit before processing completes,
  // so a crash mid-batch would lose messages. Lag looks fine; dead-letter
  // count creeps up from unacknowledged retries.
  {
    id: "scaled-consumers-unsafe-commit",
    when: {
      triggerEquals: { producerSpiking: true },
      controlAtLeast: { [CONSUMER_INSTANCES_KEY]: 8 },
      controlEquals: { [AUTO_COMMIT_ENABLED_KEY]: true },
    },
    incidentState: "degraded-integrity",
    values: {
      consumerLagMessages: 300,
      processingLatencyMs: 200,
      errorRate: 2,
      deadLetterCount: 25,
      consumerStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Partial improvement: some scaling (4 instances), not enough to
  // fully absorb the spike.
  {
    id: "partially-scaled",
    when: {
      triggerEquals: { producerSpiking: true },
      controlAtLeast: { [CONSUMER_INSTANCES_KEY]: 4 },
    },
    incidentState: "degraded",
    values: {
      consumerLagMessages: 2_200,
      processingLatencyMs: 900,
      errorRate: 3,
      deadLetterCount: 5,
      consumerStatus: "warning",
    },
    componentHealth: degradedHealth,
  },

  // ── Baseline critical: default instance count, spike active.
  {
    id: "lag-critical-default",
    when: { triggerEquals: { producerSpiking: true } },
    incidentState: "lagging",
    values: {
      consumerLagMessages: 8_000,
      processingLatencyMs: 3_500,
      errorRate: 12,
      deadLetterCount: 15,
      consumerStatus: "critical",
    },
    componentHealth: criticalHealth,
  },

  // ── Default/fallback: no spike active.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      consumerLagMessages: 200,
      processingLatencyMs: 150,
      errorRate: 0.1,
      deadLetterCount: 0,
      consumerStatus: "normal",
    },
    componentHealth: healthyHealth,
  },
];
