import type { ScenarioGoldenPath } from "./types";
import {
  SESSION_CACHE_MODE_KEY,
  TOKEN_ONLY_CONTINUATION_KEY,
} from "../identity-platform-degradation/definition";

// Derived from identity-platform-degradation/timed-events.ts:
// DEGRADATION_ONSET_MS = 30_000
// MFA_PROVIDER_RECOVERING_MS = 30_000 + 8*60_000 = 510_000
// MFA_PROVIDER_RECOVERED_MS = 510_000 + 3*60_000 = 690_000
// RELIEF_WINDOW_FULLY_RELIEVED_MS = 690_000 + 9*60_000 = 1_230_000
const MFA_PROVIDER_RECOVERED_MS = 690_000;
const RELIEF_WINDOW_FULLY_RELIEVED_MS = 1_230_000;

/**
 * Extracted from identity-platform-degradation.test.ts's
 * "fully-relieved-safe is Finish-eligible as optimal" (token-only
 * continuation plus relief-eviction session cache mode, sustained through
 * the fully-relieved window) — tier optimal.
 */
export const identityPlatformDegradationGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "identity-platform-degradation",
  actions: [
    {
      atMs: MFA_PROVIDER_RECOVERED_MS + 1_000,
      controlKey: TOKEN_ONLY_CONTINUATION_KEY,
      value: true,
    },
    {
      atMs: MFA_PROVIDER_RECOVERED_MS + 2_000,
      controlKey: SESSION_CACHE_MODE_KEY,
      value: "relief-eviction",
    },
  ],
  finishAtMs: RELIEF_WINDOW_FULLY_RELIEVED_MS + 35_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
