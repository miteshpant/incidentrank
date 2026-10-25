import type { ScenarioGoldenPath } from "./types";
import { CONSUMER_INSTANCES_KEY } from "../kafka-consumer-lag/definition";

/**
 * Extracted from kafka-consumer-lag.test.ts's "recovers when consumer
 * instances are scaled up with auto-commit off" — scaling consumer
 * instances. definition.ts's completion has no acceptableCondition
 * authored, so the resolved outcome is automatically tier optimal.
 */
export const kafkaConsumerLagGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "kafka-consumer-lag",
  actions: [{ atMs: 31_000, controlKey: CONSUMER_INSTANCES_KEY, value: 16 }],
  finishAtMs: 55_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
