import type { ScenarioGoldenPath } from "./types";
import {
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
} from "../certificate-expiry-across-large-fleet/definition";

const T_MINUS_72H_MS = 20_000;

/**
 * Extracted from certificate-expiry-across-large-fleet.test.ts's
 * MODERN_FIRST_FULL_ROTATION_ACTIONS, used by "optimal path (modern-first
 * full rotation) scores near-maximum with full dataIntegrity credit" and
 * confirmed completionTier "optimal" in the adjacent "two alternate
 * optimal paths" test — this scenario has an authored acceptableCondition
 * (mid-rotation-but-safe tier), and full rotation of all three cohorts
 * plus trust-bundle verification and old-certificate revocation is what
 * distinguishes optimal from that acceptable tier.
 */
export const certificateExpiryAcrossLargeFleetGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "certificate-expiry-across-large-fleet",
  actions: [
    { atMs: T_MINUS_72H_MS + 1_000, controlKey: CERTIFICATE_OVERLAP_WINDOW_KEY, value: "open" },
    { atMs: T_MINUS_72H_MS + 2_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "modern-rotated" },
    { atMs: T_MINUS_72H_MS + 3_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "critical-rotated" },
    { atMs: T_MINUS_72H_MS + 4_000, controlKey: LEGACY_COMPATIBILITY_BRIDGE_KEY, value: "on" },
    { atMs: T_MINUS_72H_MS + 5_000, controlKey: COHORT_ROLLOUT_STAGE_KEY, value: "legacy-bridged" },
    {
      atMs: T_MINUS_72H_MS + 6_000,
      controlKey: COHORT_ROLLOUT_STAGE_KEY,
      value: "all-cohorts-rotated",
    },
    {
      atMs: T_MINUS_72H_MS + 7_000,
      controlKey: TRUST_BUNDLE_UPDATE_STATUS_KEY,
      value: "updated-and-verified",
    },
    {
      atMs: T_MINUS_72H_MS + 8_000,
      controlKey: OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
      value: "revoked",
    },
  ],
  finishAtMs: T_MINUS_72H_MS + 45_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
