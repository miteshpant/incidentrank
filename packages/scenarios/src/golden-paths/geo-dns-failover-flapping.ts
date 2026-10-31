import type { ScenarioGoldenPath } from "./types";
import {
  HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY,
  HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY,
  INSPECT_DNS_FAILOVER_HISTORY_KEY,
  INSPECT_HEALTH_CHECK_LOGS_KEY,
  INSPECT_REGION_LATENCY_HISTORY_KEY,
} from "../geo-dns-failover-flapping/definition";

const LATENCY_BLIPS_BEGIN_MS = 30_000;

/**
 * Extracted from geo-dns-failover-flapping.test.ts's "investigating
 * health-check logs, then region latency, then DNS history, then fixing
 * both thresholds — reaches the correlated path" — the scenario's own
 * authored strong path. definition.ts's completion has no
 * acceptableCondition authored, so the resolved outcome is automatically
 * tier optimal.
 */
export const geoDnsFailoverFlappingGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "geo-dns-failover-flapping",
  actions: [
    { atMs: LATENCY_BLIPS_BEGIN_MS + 1_000, controlKey: INSPECT_HEALTH_CHECK_LOGS_KEY, value: true },
    { atMs: LATENCY_BLIPS_BEGIN_MS + 2_000, controlKey: INSPECT_REGION_LATENCY_HISTORY_KEY, value: true },
    { atMs: LATENCY_BLIPS_BEGIN_MS + 3_000, controlKey: INSPECT_DNS_FAILOVER_HISTORY_KEY, value: true },
    { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_FAILURE_STREAK_REQUIRED_KEY, value: 3 },
    { atMs: LATENCY_BLIPS_BEGIN_MS + 4_000, controlKey: HEALTH_CHECK_LATENCY_TOLERANCE_MS_KEY, value: 600 },
  ],
  finishAtMs: LATENCY_BLIPS_BEGIN_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
