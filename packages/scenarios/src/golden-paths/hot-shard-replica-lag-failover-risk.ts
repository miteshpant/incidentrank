import type { ScenarioGoldenPath } from "./types";
import {
  HOT_TENANT_THROTTLE_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
} from "../hot-shard-replica-lag-failover-risk/definition";

const HOT_SHARD_ONSET_MS = 30_000;
const REPLICA_LAG_ONSET_MS = HOT_SHARD_ONSET_MS + 15_000;
const LAG_DRAIN_WINDOW_ELAPSED_MS = REPLICA_LAG_ONSET_MS + 3 * 60_000;

/**
 * Extracted from hot-shard-replica-lag-failover-risk.test.ts's "Finish from
 * the fully-drained contained path -> resolved/optimal" (strict hot-tenant
 * throttling plus prioritized replica catch-up) — tier optimal.
 */
export const hotShardReplicaLagFailoverRiskGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "hot-shard-replica-lag-failover-risk",
  actions: [
    { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
    {
      atMs: REPLICA_LAG_ONSET_MS + 2_000,
      controlKey: REPLICA_CATCHUP_PRIORITY_KEY,
      value: "prioritized",
    },
  ],
  finishAtMs: LAG_DRAIN_WINDOW_ELAPSED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
