import type { ScenarioGoldenPath } from "./types";
import {
  DUPLICATE_HANDLING_KEY,
  ORDERING_RECONSTRUCTION_KEY,
  RECONCILIATION_MODE_KEY,
  REPORT_PUBLICATION_MODE_KEY,
} from "../audit-log-integrity-failure/definition";

/**
 * Extracted from audit-log-integrity-failure.test.ts's "reaches genuine
 * OPTIMAL once the full drain window elapses, with ingestionPause left
 * at its untouched default" (alternate strong path A: PATH_A_ACTIONS) —
 * stages report publication until reconciled, activates reconciliation,
 * dedupes by fingerprint, and reconstructs ordering via timestamp
 * verification. Asserted resolved/optimal via
 * evaluateCandidateDeclaredFinish.
 */
export const auditLogIntegrityFailureGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "audit-log-integrity-failure",
  actions: [
    { atMs: 201_000, controlKey: REPORT_PUBLICATION_MODE_KEY, value: "stage-until-reconciled" },
    { atMs: 202_000, controlKey: RECONCILIATION_MODE_KEY, value: "active" },
    { atMs: 203_000, controlKey: DUPLICATE_HANDLING_KEY, value: "dedupe-by-fingerprint" },
    { atMs: 204_000, controlKey: ORDERING_RECONSTRUCTION_KEY, value: "timestamp-verified-reconstruction" },
  ],
  finishAtMs: 535_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
