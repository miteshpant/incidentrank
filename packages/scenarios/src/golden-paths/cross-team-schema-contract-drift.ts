import type { ScenarioGoldenPath } from "./types";
import {
  INSPECT_SCHEMA_DIFF_KEY,
  INSPECT_BILLING_ERRORS_KEY,
  INSPECT_ANALYTICS_DRIFT_KEY,
  INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
  PUBLISH_SCHEMA_COMPAT_SHIM_KEY,
  REDEPLOY_BILLING_MAPPER_KEY,
  BACKFILL_ANALYTICS_WAREHOUSE_KEY,
  REDEPLOY_FRAUD_DESERIALIZER_KEY,
} from "../cross-team-schema-contract-drift/definition";

const DRIFT_BEGINS_MS = 30_000;

/**
 * Extracted from cross-team-schema-contract-drift.test.ts's "investigating
 * all four sources, then shim + all three consumer fixes in that order —
 * reaches full recovery" / "verification: successCondition requires schema
 * violations, Billing, Analytics, AND Fraud all recovered simultaneously"
 * — the scenario's own authored strong path, fully triaging all three
 * independently-owned downstream consumers rather than stopping at the
 * loudest pipeline. definition.ts's completion has no acceptableCondition
 * authored, so the resolved outcome is automatically tier optimal.
 */
export const crossTeamSchemaContractDriftGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cross-team-schema-contract-drift",
  actions: [
    { atMs: DRIFT_BEGINS_MS + 1_000, controlKey: INSPECT_SCHEMA_DIFF_KEY, value: true },
    { atMs: DRIFT_BEGINS_MS + 2_000, controlKey: INSPECT_BILLING_ERRORS_KEY, value: true },
    { atMs: DRIFT_BEGINS_MS + 3_000, controlKey: INSPECT_ANALYTICS_DRIFT_KEY, value: true },
    {
      atMs: DRIFT_BEGINS_MS + 4_000,
      controlKey: INSPECT_FRAUD_DESERIALIZATION_ERRORS_KEY,
      value: true,
    },
    { atMs: DRIFT_BEGINS_MS + 5_000, controlKey: PUBLISH_SCHEMA_COMPAT_SHIM_KEY, value: true },
    { atMs: DRIFT_BEGINS_MS + 6_000, controlKey: REDEPLOY_BILLING_MAPPER_KEY, value: true },
    { atMs: DRIFT_BEGINS_MS + 7_000, controlKey: BACKFILL_ANALYTICS_WAREHOUSE_KEY, value: true },
    { atMs: DRIFT_BEGINS_MS + 8_000, controlKey: REDEPLOY_FRAUD_DESERIALIZER_KEY, value: true },
  ],
  finishAtMs: DRIFT_BEGINS_MS + 25_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
