import type { ScenarioGoldenPath } from "./types";
import { LEDGER_WRITE_ROUTING_KEY } from "../network-partition/definition";

const NETWORK_PARTITION_MS = 30_000;

/**
 * Extracted from network-partition.test.ts's "Finish from single-region-
 * routed -> resolved/optimal" case (strong path: single-region-
 * authoritative ledger routing). This scenario has no authored
 * acceptableCondition (single-tier completion — see definition.ts), so
 * any Finish reaching outcome "resolved" is automatically tier "optimal".
 */
export const networkPartitionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "network-partition",
  actions: [
    { atMs: NETWORK_PARTITION_MS + 1_000, controlKey: LEDGER_WRITE_ROUTING_KEY, value: "single-region-authoritative" },
  ],
  finishAtMs: NETWORK_PARTITION_MS + 40_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
