import type { ScenarioGoldenPath } from "./types";
import {
  FAILOVER_INITIATED_KEY,
  OLD_PRIMARY_FENCING_KEY,
  PROMOTION_TIMING_KEY,
  WRITE_ROUTING_POLICY_KEY,
} from "../primary-database-failover/definition";

const PRIMARY_DEGRADING_MS = 30_000;

/**
 * Extracted from primary-database-failover.test.ts's lagDrainedFencedActions
 * ("Finish from optimal -> resolved/optimal") — waiting for replication lag
 * to drain, fencing the old primary, and cutting write routing over to the
 * new primary. Asserted eligible: true, tier: "optimal".
 */
export const primaryDatabaseFailoverGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "primary-database-failover",
  actions: [
    { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: FAILOVER_INITIATED_KEY, value: true },
    { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: PROMOTION_TIMING_KEY, value: "waitForLagDrain" },
    { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: OLD_PRIMARY_FENCING_KEY, value: true },
    { atMs: PRIMARY_DEGRADING_MS + 1_000, controlKey: WRITE_ROUTING_POLICY_KEY, value: "newPrimary" },
  ],
  finishAtMs: PRIMARY_DEGRADING_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
