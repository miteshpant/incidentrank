import type { ScenarioGoldenPath } from "./types";
import {
  PARTITION_COUNT_KEY,
  PARTITION_KEY_STRATEGY_KEY,
} from "../kafka-partition-skew/definition";

/**
 * Extracted from kafka-partition-skew.test.ts's "salted key with enough
 * partitions, sustained, is eligible for an OPTIMAL-tier Finish" —
 * tenant-id-salted partitioning plus raising partition count. This drives
 * orderingMode to "preserved", which acceptableCondition reads to classify
 * the resolved outcome as tier optimal (as opposed to the round-robin path,
 * which leaves orderingMode "degraded" and resolves only at tier
 * acceptable).
 */
export const kafkaPartitionSkewGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "kafka-partition-skew",
  actions: [
    { atMs: 31_000, controlKey: PARTITION_KEY_STRATEGY_KEY, value: "tenant-id-salted" },
    { atMs: 31_000, controlKey: PARTITION_COUNT_KEY, value: 8 },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
