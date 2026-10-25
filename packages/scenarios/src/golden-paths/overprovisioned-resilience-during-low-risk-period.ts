import type { ScenarioGoldenPath } from "./types";
import {
  FAILOVER_RESERVE_KEY,
  MULTI_AZ_MODE_KEY,
  REPLICA_COUNT_KEY,
  STANDBY_FLEET_KEY,
  WARM_CAPACITY_KEY,
} from "../overprovisioned-resilience-during-low-risk-period/definition";
import { HIGH_RISK_WINDOW_ENDED_MS, REDUCTION_SETTLE_WINDOW_MS } from "../overprovisioned-resilience-during-low-risk-period/timed-events";

/**
 * Extracted from overprovisioned-resilience-during-low-risk-period.test.ts's
 * SAFE_COMPUTE_FIRST_ACTIONS ("strategy A (compute/standby-first) reaches a
 * genuinely safe, cost-reduced settled state" / "optimal path (strategy A,
 * compute-first) scores well above baseline") — the compute/standby-first
 * safe-reduction strong path, asserted eligible: true, tier: "optimal".
 */
export const overprovisionedResilienceDuringLowRiskPeriodGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "overprovisioned-resilience-during-low-risk-period",
  actions: [
    { atMs: HIGH_RISK_WINDOW_ENDED_MS + 1_000, controlKey: MULTI_AZ_MODE_KEY, value: "single-az-with-standby" },
    { atMs: HIGH_RISK_WINDOW_ENDED_MS + 2_000, controlKey: FAILOVER_RESERVE_KEY, value: "baseline-reserved" },
    { atMs: HIGH_RISK_WINDOW_ENDED_MS + 3_000, controlKey: REPLICA_COUNT_KEY, value: "baseline-operating" },
    { atMs: HIGH_RISK_WINDOW_ENDED_MS + 4_000, controlKey: WARM_CAPACITY_KEY, value: "reduced" },
    { atMs: HIGH_RISK_WINDOW_ENDED_MS + 5_000, controlKey: STANDBY_FLEET_KEY, value: "reduced" },
  ],
  finishAtMs: HIGH_RISK_WINDOW_ENDED_MS + REDUCTION_SETTLE_WINDOW_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
