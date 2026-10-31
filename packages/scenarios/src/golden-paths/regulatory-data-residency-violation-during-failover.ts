import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_FAILOVER_ROUTING_LOGS_KEY,
  INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
  INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
  VERIFY_EU_REGION_RECOVERED_KEY,
  ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
} from "../regulatory-data-residency-violation-during-failover/definition";

const AUTOMATIC_FAILOVER_COMPLETES_MS = 45_000;
const EU_REGION_INFRASTRUCTURE_RECOVERS_MS = 180_000;

/**
 * Extracted from regulatory-data-residency-violation-during-failover.test.ts's
 * "investigating all three signals, waiting for genuine recovery,
 * verifying, then enabling the gateway reaches the correlated path" —
 * the scenario's own authored strong path. definition.ts's completion
 * has no acceptableCondition authored, so the resolved outcome is
 * automatically tier optimal.
 */
export const regulatoryDataResidencyViolationDuringFailoverGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "regulatory-data-residency-violation-during-failover",
  actions: [
    {
      atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 1_000,
      controlKey: INSPECT_FAILOVER_ROUTING_LOGS_KEY,
      value: true,
    },
    {
      atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 2_000,
      controlKey: INSPECT_DATA_RESIDENCY_AUDIT_TRAIL_KEY,
      value: true,
    },
    {
      atMs: AUTOMATIC_FAILOVER_COMPLETES_MS + 3_000,
      controlKey: INSPECT_LEGAL_NOTIFICATION_REQUIREMENTS_KEY,
      value: true,
    },
    {
      atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 1_000,
      controlKey: VERIFY_EU_REGION_RECOVERED_KEY,
      value: true,
    },
    {
      atMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 2_000,
      controlKey: ENABLE_EU_DATA_LOCK_GATEWAY_KEY,
      value: true,
    },
  ],
  finishAtMs: EU_REGION_INFRASTRUCTURE_RECOVERS_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
