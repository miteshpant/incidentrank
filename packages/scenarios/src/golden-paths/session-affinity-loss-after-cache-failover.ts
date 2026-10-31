import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_SESSION_ROUTING_KEY,
  INSPECT_AUTH_ERROR_LOGS_KEY,
  INSPECT_CACHE_NODE_METRICS_KEY,
  RESEED_HASH_RING_KEY,
  FORCE_SESSION_RESYNC_KEY,
} from "../session-affinity-loss-after-cache-failover/definition";

const FAILOVER_BEGINS_MS = 30_000;

/**
 * Extracted from session-affinity-loss-after-cache-failover.test.ts's
 * "investigating routing, then auth logs, then cache metrics, then
 * applying both fix halves — reaches the correlated path" — the
 * scenario's own authored strong path. definition.ts's completion has
 * no acceptableCondition authored, so the resolved outcome is
 * automatically tier optimal.
 */
export const sessionAffinityLossAfterCacheFailoverGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "session-affinity-loss-after-cache-failover",
  actions: [
    { atMs: FAILOVER_BEGINS_MS + 1_000, controlKey: INSPECT_SESSION_ROUTING_KEY, value: true },
    { atMs: FAILOVER_BEGINS_MS + 2_000, controlKey: INSPECT_AUTH_ERROR_LOGS_KEY, value: true },
    { atMs: FAILOVER_BEGINS_MS + 3_000, controlKey: INSPECT_CACHE_NODE_METRICS_KEY, value: true },
    { atMs: FAILOVER_BEGINS_MS + 4_000, controlKey: RESEED_HASH_RING_KEY, value: true },
    { atMs: FAILOVER_BEGINS_MS + 5_000, controlKey: FORCE_SESSION_RESYNC_KEY, value: true },
  ],
  finishAtMs: FAILOVER_BEGINS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
