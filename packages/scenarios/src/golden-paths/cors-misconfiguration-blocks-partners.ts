import type { ScenarioGoldenPath } from "./types";
import {
  CORS_ALLOWED_ORIGINS_MODE_KEY,
  INSPECT_CORS_POLICY_DIFF_KEY,
  INSPECT_PARTNER_ERROR_LOGS_KEY,
  INSPECT_PREFLIGHT_RESPONSES_KEY,
} from "../cors-misconfiguration-blocks-partners/definition";

const HARDENING_DEPLOYED_MS = 30_000;

/**
 * Extracted from cors-misconfiguration-blocks-partners.test.ts's
 * "investigating the policy diff, then error logs, then preflight
 * responses, then allowlisting — reaches the correlated path" /
 * "verification: successCondition requires both error rates recovered
 * AND corsPolicyStatus not critical" — the scenario's own authored
 * strong path. This scenario is candidate_declared completion, so
 * finishAtMs must be far enough past the fix for successCondition's
 * sustainedSeconds (15s) to have actually elapsed before Finish is
 * declared — evaluateCandidateDeclaredFinish reads the engine's own
 * already-tracked consecutiveSuccessSeconds, not a second evaluator.
 */
export const corsMisconfigurationBlocksPartnersGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "cors-misconfiguration-blocks-partners",
  actions: [
    { atMs: HARDENING_DEPLOYED_MS + 1_000, controlKey: INSPECT_CORS_POLICY_DIFF_KEY, value: true },
    { atMs: HARDENING_DEPLOYED_MS + 2_000, controlKey: INSPECT_PARTNER_ERROR_LOGS_KEY, value: true },
    { atMs: HARDENING_DEPLOYED_MS + 3_000, controlKey: INSPECT_PREFLIGHT_RESPONSES_KEY, value: true },
    {
      atMs: HARDENING_DEPLOYED_MS + 4_000,
      controlKey: CORS_ALLOWED_ORIGINS_MODE_KEY,
      value: "allowlist-partners",
    },
  ],
  finishAtMs: HARDENING_DEPLOYED_MS + 20_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
