import type { ScenarioGoldenPath } from "./types";
import {
  BURST_SIZE_KEY,
  PER_TENANT_QUOTA_KEY,
} from "../rate-limit-misconfiguration/definition";

/**
 * Extracted from rate-limit-misconfiguration.test.ts's "Finish from
 * optimal -> resolved/optimal" case (retuned: burst size tightened +
 * per-tenant quota raised) — fixes both halves of the root cause.
 */
export const rateLimitMisconfigurationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "rate-limit-misconfiguration",
  actions: [
    { atMs: 31_000, controlKey: BURST_SIZE_KEY, value: 200 },
    { atMs: 31_000, controlKey: PER_TENANT_QUOTA_KEY, value: 400 },
  ],
  finishAtMs: 55_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
