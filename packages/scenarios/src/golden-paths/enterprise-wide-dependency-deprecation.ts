import type { ScenarioGoldenPath } from "./types";
import {
  COMPATIBILITY_LAYER_MODE_KEY,
  DEPRECATED_API_TRAFFIC_BLOCK_KEY,
  MIGRATION_COHORT_ORDER_KEY,
  MIGRATION_VERIFICATION_MODE_KEY,
  PRODUCT_B_MIGRATION_KEY,
  PRODUCT_C_MIGRATION_KEY,
  PRODUCT_D_MIGRATION_KEY,
  REPLACEMENT_TRAFFIC_PERCENT_KEY,
  ROLLBACK_READINESS_KEY,
} from "../enterprise-wide-dependency-deprecation/definition";

/**
 * Extracted from enterprise-wide-dependency-deprecation.test.ts's
 * "Alternate Strong Path A: compatibility-layer-first staged migration" ->
 * "reaches genuine OPTIMAL once every recovery-lag window elapses, with
 * dualSupportMode left at its untouched default" (STRATEGY_A_ACTIONS,
 * untilMs = TRAFFIC_DRAIN_WINDOW_ELAPSED_MS + 45_000). This scenario is
 * #100 (enterprise-wide-dependency-deprecation) and has multiple valid
 * alternate paths preserved in its own .test.ts — this file captures only
 * ONE canonical golden path (the clearest, most "textbook" good path),
 * per phase7.action.md section 18. Product A starts already migrated but
 * unverified in this scenario's authored initial state, so Strategy A
 * never needs to touch PRODUCT_A_MIGRATION_KEY directly.
 */
export const enterpriseWideDependencyDeprecationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "enterprise-wide-dependency-deprecation",
  actions: [
    { atMs: 20_001, controlKey: MIGRATION_COHORT_ORDER_KEY, value: "prerequisite-first" },
    { atMs: 20_002, controlKey: MIGRATION_VERIFICATION_MODE_KEY, value: "verify-before-complete" },
    { atMs: 20_003, controlKey: COMPATIBILITY_LAYER_MODE_KEY, value: "active" },
    { atMs: 20_004, controlKey: PRODUCT_C_MIGRATION_KEY, value: "migrate" },
    { atMs: 20_005, controlKey: PRODUCT_B_MIGRATION_KEY, value: "migrate" },
    { atMs: 20_006, controlKey: PRODUCT_D_MIGRATION_KEY, value: "migrate" },
    { atMs: 20_007, controlKey: REPLACEMENT_TRAFFIC_PERCENT_KEY, value: 100 },
    { atMs: 20_008, controlKey: DEPRECATED_API_TRAFFIC_BLOCK_KEY, value: "blocked" },
    { atMs: 20_009, controlKey: ROLLBACK_READINESS_KEY, value: "prepared" },
  ],
  finishAtMs: 440_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
