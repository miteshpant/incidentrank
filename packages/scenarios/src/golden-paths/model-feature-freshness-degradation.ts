import type { ScenarioGoldenPath } from "./types";
import {
  CRITICAL_DECISION_HOLD_KEY,
  PIPELINE_PRIORITY_KEY,
  STALE_FEATURE_CUTOFF_KEY,
} from "../model-feature-freshness-degradation/definition";
import { DRAIN_WINDOW_FULLY_RECOVERED_MS, SUSTAINED_LAG_MS } from "../model-feature-freshness-degradation/timed-events";

/**
 * Extracted from model-feature-freshness-degradation.test.ts's "optimal
 * path (fully-recovered-held-prioritized) scores near-maximum with full
 * dataIntegrity credit" case (alternate strong path B: bounded cutoff +
 * critical-decision hold + critical-features-first pipeline priority,
 * fully drained).
 */
export const modelFeatureFreshnessDegradationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "model-feature-freshness-degradation",
  actions: [
    { atMs: SUSTAINED_LAG_MS + 1_000, controlKey: STALE_FEATURE_CUTOFF_KEY, value: "bounded" },
    { atMs: SUSTAINED_LAG_MS + 2_000, controlKey: CRITICAL_DECISION_HOLD_KEY, value: true },
    { atMs: SUSTAINED_LAG_MS + 3_000, controlKey: PIPELINE_PRIORITY_KEY, value: "critical-features-first" },
  ],
  finishAtMs: DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
