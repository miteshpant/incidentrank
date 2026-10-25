import type { ScenarioGoldenPath } from "./types";
import {
  EU_TRAFFIC_PERCENTAGE_KEY,
  HIGH_RISK_THROTTLE_KEY,
  LEDGER_WRITE_AUTHORITY_KEY,
  SETTLEMENT_WORKER_PRIORITY_KEY,
} from "../multi-region-payment-platform-degradation/definition";

const REPLICATION_LAG_ONSET_MS = 45_000;
const CATCHUP_WINDOW_ELAPSED_MS = REPLICATION_LAG_ONSET_MS + 3 * 60_000;

/**
 * Extracted from multi-region-payment-platform-degradation.test.ts's
 * "Finish from the fully-drained protected-shift path -> resolved/optimal"
 * case: PROTECTED_SHIFT_ACTIONS — correct sequencing of protecting
 * ledger authority first, then a bounded traffic shift, then protecting
 * US settlement capacity — run through the full catch-up window.
 */
export const multiRegionPaymentPlatformDegradationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "multi-region-payment-platform-degradation",
  actions: [
    { atMs: REPLICATION_LAG_ONSET_MS + 1_000, controlKey: LEDGER_WRITE_AUTHORITY_KEY, value: "us-authoritative" },
    { atMs: REPLICATION_LAG_ONSET_MS + 2_000, controlKey: EU_TRAFFIC_PERCENTAGE_KEY, value: 40 },
    { atMs: REPLICATION_LAG_ONSET_MS + 3_000, controlKey: SETTLEMENT_WORKER_PRIORITY_KEY, value: "critical-path-first" },
    { atMs: REPLICATION_LAG_ONSET_MS + 4_000, controlKey: HIGH_RISK_THROTTLE_KEY, value: "on" },
  ],
  finishAtMs: CATCHUP_WINDOW_ELAPSED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
