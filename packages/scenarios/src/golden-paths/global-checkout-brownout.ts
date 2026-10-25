import type { ScenarioGoldenPath } from "./types";
import {
  ENRICHMENT_MODE_KEY,
  PRICING_MODE_KEY,
  PROMOTIONS_MODE_KEY,
  TAX_MODE_KEY,
} from "../global-checkout-brownout/definition";

/**
 * Extracted from global-checkout-brownout.test.ts's "Finish from full trim
 * -> resolved/optimal..." (FULL_TRIM_ACTIONS: trimming all three
 * non-critical dependencies off the synchronous path).
 */
export const globalCheckoutBrownoutGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "global-checkout-brownout",
  actions: [
    { atMs: 31_000, controlKey: PROMOTIONS_MODE_KEY, value: "disabled" },
    { atMs: 31_000, controlKey: TAX_MODE_KEY, value: "bounded-fallback" },
    { atMs: 31_000, controlKey: PRICING_MODE_KEY, value: "cached-fallback" },
    { atMs: 31_000, controlKey: ENRICHMENT_MODE_KEY, value: "reduced" },
  ],
  finishAtMs: 70_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
