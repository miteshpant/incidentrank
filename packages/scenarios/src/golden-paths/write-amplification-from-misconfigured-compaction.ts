import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_DISK_IOPS_METRICS_KEY,
  INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
  INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
  COMPACTION_LEVEL_MULTIPLIER_KEY,
} from "../write-amplification-from-misconfigured-compaction/definition";

const TRAFFIC_BUMP_BEGINS_MS = 30_000;

/**
 * Extracted from write-amplification-from-misconfigured-compaction.test.ts's
 * "investigating disk IOPS, then write amplification, then compaction
 * config history, then fixing — reaches the correlated path" — the
 * scenario's own authored strong path. definition.ts's completion has no
 * acceptableCondition authored, so the resolved outcome is automatically
 * tier optimal.
 */
export const writeAmplificationFromMisconfiguredCompactionGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "write-amplification-from-misconfigured-compaction",
  actions: [
    { atMs: TRAFFIC_BUMP_BEGINS_MS + 1_000, controlKey: INSPECT_DISK_IOPS_METRICS_KEY, value: true },
    {
      atMs: TRAFFIC_BUMP_BEGINS_MS + 2_000,
      controlKey: INSPECT_WRITE_AMPLIFICATION_METRICS_KEY,
      value: true,
    },
    {
      atMs: TRAFFIC_BUMP_BEGINS_MS + 3_000,
      controlKey: INSPECT_COMPACTION_CONFIG_HISTORY_KEY,
      value: true,
    },
    { atMs: TRAFFIC_BUMP_BEGINS_MS + 4_000, controlKey: COMPACTION_LEVEL_MULTIPLIER_KEY, value: 8 },
  ],
  finishAtMs: TRAFFIC_BUMP_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
