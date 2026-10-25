import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { MISUSE_MONITORING_KEY, NEW_CREDENTIAL_ISSUED_KEY } from "./controls";

export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  // The "do nothing" trap looks cheap on this axis by design —
  // availability is genuinely fine while the credential stays fully
  // trusted. The real cost of this path is paid entirely in
  // dataIntegrity scoring, never here (see scoring.ts's module
  // comment) — exactly mirroring Identity Platform Degradation's and
  // Authorization Policy Rollout Failure's bypass/fail-open paths.
  "fully-trusted-baseline-exposure": 5,
  "fully-trusted-sustained-exposure": 5,
  "broad-immediate-revocation-zero-migrated": 2_400,
  "broad-immediate-revocation-cohort-a-migrated": 1_500,
  "monitored-scope-identified": 0,
  "monitored-investigation-not-started": 0,
  "monitored-without-active-monitoring": 0,
  "fully-contained-reviewed": 0,
  "fully-contained-unreviewed": 0,
  "staged-rotation-cohort-a-only": 0,
  "staged-rotation-cohort-a-claimed-not-yet-elapsed": 0,
  "staged-rotation-cohort-b-claimed-not-yet-elapsed": 0,
  "new-credential-issued-no-cohort-migrated-yet": 0,
  "cohort-migration-claimed-without-new-credential": 0,
  healthy: 0,
};

export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 180,
  perUnitMonthlyUsd: {
    [`${MISUSE_MONITORING_KEY}:true`]: 35,
    [`${MISUSE_MONITORING_KEY}:false`]: 0,
    [`${NEW_CREDENTIAL_ISSUED_KEY}:true`]: 10,
    [`${NEW_CREDENTIAL_ISSUED_KEY}:false`]: 0,
  },
};

/**
 * successCondition (OPTIMAL) requires the fully-contained-and-reviewed
 * state: every known dependent cohort has migrated to the new
 * credential, the old exposed credential has been fully revoked
 * everywhere with zero avoidable breakage, AND the historical audit
 * review pass has been completed — the single state where both the
 * live security posture and the auditability business invariant are
 * genuinely, completely satisfied.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "credentialContainmentStatus", operator: "equals", comparedTo: "fully-contained" },
    { key: "auditReviewStatus", operator: "equals", comparedTo: "reviewed" },
    { key: "externalIntegrationSuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
  ],
  sustainedSeconds: 20,
};

/**
 * acceptableCondition (ACCEPTABLE) — the legitimate bounded handback:
 * EITHER the credential is fully contained but the historical audit
 * review has not yet been completed (fully-contained-unreviewed), OR
 * cohort-staged rotation is genuinely in progress with the credential
 * no longer fully trusted and no avoidable breakage having occurred
 * (monitored or staged-rotation postures). Both are real, bounded,
 * genuinely safe tradeoffs — never a security violation, never
 * self-inflicted breakage — even though neither is the complete,
 * fully-audited OPTIMAL resolution.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "credentialContainmentStatus", operator: "not_equals", comparedTo: "trusted" },
    { key: "credentialContainmentStatus", operator: "not_equals", comparedTo: "broad-revoked-unsequenced" },
    { key: "externalIntegrationSuccessRate", operator: "greater_than_or_equal", comparedTo: 99 },
  ],
  sustainedSeconds: 20,
};

/**
 * Failure condition: a sustained, severe compounding exposure. If
 * suspectedExposedCredentialUseCount is allowed to climb past 40 (i.e.
 * the candidate leaves the credential fully-trusted through the
 * sustained-exposure escalation window) and stays there, the incident
 * is treated as an automatic failure — failure is never gated by
 * completion mode (tick.ts), so a candidate cannot simply decline to
 * Finish and wait out a live, worsening exposure.
 */
export const failureCondition: FailureCondition = {
  conditions: [
    { key: "suspectedExposedCredentialUseCount", operator: "greater_than_or_equal", comparedTo: 40 },
  ],
  sustainedSeconds: 45,
};
