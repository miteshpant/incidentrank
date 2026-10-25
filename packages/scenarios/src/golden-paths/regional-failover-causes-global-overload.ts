import type { ScenarioGoldenPath } from "./types";
import {
  CACHE_PROTECTION_KEY,
  DB_CONCURRENCY_KEY,
  FAILOVER_CAP_KEY,
  LOW_PRIORITY_TRAFFIC_KEY,
} from "../regional-failover-causes-global-overload/definition";

/**
 * Extracted from regional-failover-causes-global-overload.test.ts's
 * "full protection mid-incident is eligible (optimal tier) even though
 * Region A is still offline" case (the CAPACITY_MANAGED_ACTIONS chain:
 * cap failover at the critical floor, shed optional traffic, protect
 * cache + DB) — the capacity-managed-full-protection path.
 */
export const regionalFailoverCausesGlobalOverloadGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "regional-failover-causes-global-overload",
  actions: [
    { atMs: 31_000, controlKey: FAILOVER_CAP_KEY, value: 80 },
    { atMs: 31_000, controlKey: LOW_PRIORITY_TRAFFIC_KEY, value: "shed" },
    { atMs: 31_000, controlKey: CACHE_PROTECTION_KEY, value: "on" },
    { atMs: 31_000, controlKey: DB_CONCURRENCY_KEY, value: "capped" },
  ],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
