import type { ScenarioGoldenPath } from "./types";
import {
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
} from "../secret-leakage-containment-incident/definition";

/**
 * Extracted from secret-leakage-containment-incident.test.ts's
 * "fully-contained-reviewed is Finish-eligible as optimal" case
 * (safeFullSequenceActions()): monitor + investigate, issue a new
 * credential, stage revocation cohort by cohort, fully revoke once both
 * cohorts have migrated, then complete the audit review.
 */
export const secretLeakageContainmentIncidentGoldenPath: ScenarioGoldenPath = {
  scenarioSlug: "secret-leakage-containment-incident",
  actions: [
    { atMs: 31_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "monitored" },
    { atMs: 32_000, controlKey: MISUSE_MONITORING_KEY, value: true },
    { atMs: 33_000, controlKey: INVESTIGATION_STATUS_KEY, value: "scope-identified" },
    { atMs: 34_000, controlKey: NEW_CREDENTIAL_ISSUED_KEY, value: true },
    { atMs: 35_000, controlKey: REVOCATION_SCOPE_KEY, value: "cohort-staged" },
    { atMs: 211_000, controlKey: DEPENDENT_COHORT_MIGRATION_KEY, value: "cohort-a-migrated" },
    { atMs: 212_000, controlKey: EXPOSED_CREDENTIAL_TRUST_MODE_KEY, value: "revoked" },
    { atMs: 451_000, controlKey: DEPENDENT_COHORT_MIGRATION_KEY, value: "cohort-a-and-b-migrated" },
    { atMs: 452_000, controlKey: AUDIT_LOG_REVIEW_KEY, value: true },
  ],
  finishAtMs: 480_000,
  expectedOutcome: "resolved",
  expectedCompletionTier: "optimal",
};
