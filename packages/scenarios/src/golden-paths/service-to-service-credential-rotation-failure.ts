import type { ScenarioGoldenPath } from "./types";
import {
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROTATION_COHORT_STAGE_KEY,
} from "../service-to-service-credential-rotation-failure/definition";

/**
 * Extracted from service-to-service-credential-rotation-failure.test.ts's
 * SAFE_STAGED_ROTATION_ACTIONS ("the never-erring staged path reaches
 * fully-rotated-safe") — explicitly asserted eligible with tier "optimal".
 */
export const serviceToServiceCredentialRotationFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "service-to-service-credential-rotation-failure",
  actions: [
    { atMs: 21_000, controlKey: NEW_CREDENTIAL_ACTIVATION_KEY, value: true },
    { atMs: 22_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-1-verified" },
    { atMs: 23_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "cohort-2-verified" },
    { atMs: 24_000, controlKey: ROTATION_COHORT_STAGE_KEY, value: "all-cohorts-verified" },
    { atMs: 25_000, controlKey: OLD_CREDENTIAL_VALIDITY_KEY, value: "revoked" },
  ],
  finishAtMs: 50_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
