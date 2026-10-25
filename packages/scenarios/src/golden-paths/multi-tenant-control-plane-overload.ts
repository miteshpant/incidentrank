import type { ScenarioGoldenPath } from "./types";
import {
  HOT_TENANT_QUOTA_KEY,
  METADATA_WRITE_BATCHING_KEY,
  QUEUE_PARTITIONING_KEY,
} from "../multi-tenant-control-plane-overload/definition";

const HOT_TENANT_CHURN_BEGINS_MS = 30_000;
const DRAIN_WINDOW_MS = HOT_TENANT_CHURN_BEGINS_MS + 5 * 60_000;

/**
 * Extracted from multi-tenant-control-plane-overload.test.ts's "Finish
 * from the full fix -> resolved/optimal" case (quota-capping the hot
 * tenant plus a dedicated lane plus moderate metadata-write batching,
 * once the drain window elapses).
 */
export const multiTenantControlPlaneOverloadGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "multi-tenant-control-plane-overload",
  actions: [
    { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: HOT_TENANT_QUOTA_KEY, value: "capped-30-percent" },
    { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: QUEUE_PARTITIONING_KEY, value: "dedicated-lane" },
    { atMs: HOT_TENANT_CHURN_BEGINS_MS + 1_000, controlKey: METADATA_WRITE_BATCHING_KEY, value: "moderate" },
  ],
  finishAtMs: DRAIN_WINDOW_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
