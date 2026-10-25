import type { ScenarioGoldenPath } from "./types";
import { PER_TENANT_QUOTA_KEY } from "../uneven-tenant-traffic/definition";

/**
 * Extracted from uneven-tenant-traffic.test.ts's "Finish from optimal ->
 * resolved/optimal" — explicitly asserts outcome "resolved" and
 * completionTier "optimal".
 */
export const unevenTenantTrafficGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "uneven-tenant-traffic",
  actions: [{ atMs: 31_000, controlKey: PER_TENANT_QUOTA_KEY, value: "strict" }],
  finishAtMs: 65_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
