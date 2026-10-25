import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { secretLeakageContainmentIncidentRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  AUDIT_LOG_REVIEW_KEY,
  DEPENDENT_COHORT_MIGRATION_KEY,
  EXPOSED_CREDENTIAL_TRUST_MODE_KEY,
  INVESTIGATION_STATUS_KEY,
  MISUSE_MONITORING_KEY,
  NEW_CREDENTIAL_ISSUED_KEY,
  REVOCATION_SCOPE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const secretLeakageContainmentIncidentSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      key: "externalIntegrationStatus",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "External Integrations have entered a critical state.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "External Integrations have recovered.",
      },
    },
  ],
  numericWatchFields: [
    {
      key: "suspectedExposedCredentialUseCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "At least one suspected use of the exposed credential has been recorded since exposure was identified — a permanent historical consequence that will not be erased by any later containment action.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further suspected exposed-credential use is currently accruing.",
      },
    },
    {
      key: "migratedCohortCount",
      trackPeak: true,
    },
    {
      key: "externalIntegrationSuccessRate",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: secretLeakageContainmentIncidentRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (phase-6e-strategy-spec.md section 16,
  // same style/rigor as distributed-coordination-failure/definition.ts,
  // identity-platform-degradation/definition.ts, and
  // authorization-policy-rollout-failure/definition.ts) ───────────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (applicationRequestSuccessRate /
  // externalIntegrationSuccessRate / externalIntegrationStatus /
  // blastRadiusStatus / migratedCohortCount /
  // suspectedExposedCredentialUseCount / credentialContainmentStatus /
  // auditReviewStatus):
  //
  //   healthy-default                                 N/A (pre-incident)
  //   fully-trusted-baseline-exposure                  UNSAFE  99.9/99.8/normal/unknown/0/12/trusted/unreviewed
  //   fully-trusted-sustained-exposure                 UNSAFE  99.9/99.8/normal/unknown/0/46/trusted/unreviewed
  //     (the "do nothing" trap — availability stays PERFECT while a
  //     real, growing, non-resetting historical exposure count
  //     accrues; the longer this is left active the worse the
  //     permanent record gets, and holding it through the sustained
  //     window reaches automatic failure)
  //   broad-immediate-revocation-zero-migrated         UNSAFE  42/8/critical/unknown/0/0/broad-revoked-unsequenced/unreviewed
  //   broad-immediate-revocation-cohort-a-migrated      UNSAFE  68/45/critical/identified/1/0/broad-revoked-unsequenced/unreviewed
  //     (the unsequenced-revocation trap — security is fixed instantly
  //     but real dependent systems break immediately; strictly worse
  //     availability than doing nothing, the opposite failure mode
  //     from the "do nothing" trap)
  //   monitored-scope-identified                        ACCEPTABLE 99.9/99.8/normal/identified/0/0/monitored/unreviewed
  //   monitored-investigation-not-started                ACCEPTABLE 99.9/99.8/normal/unknown/0/0/monitored/unreviewed
  //   monitored-without-active-monitoring                 ACCEPTABLE 99.9/99.8/normal/unknown/0/0/monitored/unreviewed
  //   new-credential-issued-no-cohort-migrated-yet        ACCEPTABLE 99.9/99.8/normal/identified/0/0/monitored/unreviewed
  //   cohort-migration-claimed-without-new-credential     ACCEPTABLE 99.9/99.8/normal/identified/0/0/monitored/unreviewed
  //   staged-rotation-cohort-a-claimed-not-yet-elapsed    ACCEPTABLE 99.9/99.8/normal/identified/0/0/monitored/unreviewed
  //   staged-rotation-cohort-a-only                       ACCEPTABLE 99.9/99.8/normal/identified/1/0/staged-rotation/unreviewed
  //   staged-rotation-cohort-b-claimed-not-yet-elapsed    ACCEPTABLE 99.9/99.8/normal/identified/1/0/staged-rotation/unreviewed
  //   fully-contained-unreviewed                          ACCEPTABLE 99.9/99.8/normal/identified/2/0/fully-contained/unreviewed
  //   fully-contained-reviewed                            OPTIMAL 99.9/99.8/normal/identified/2/0/fully-contained/reviewed
  //
  // ── Why every "monitored"/"staged-rotation" state is ACCEPTABLE,
  // never UNSAFE ───────────────────────────────────────────────────
  // Every one of these states has credentialContainmentStatus strictly
  // outside {"trusted","broad-revoked-unsequenced"},
  // externalIntegrationSuccessRate >= 99 (never degraded), and
  // suspectedExposedCredentialUseCount == 0 (live value) — no new
  // historical damage is accruing and no avoidable breakage has
  // occurred. This is deliberately NOT "almost done" — a candidate who
  // has moved the credential to monitored, or is partway through a
  // genuinely-sequenced cohort-staged rotation, has already left both
  // forbidden levers behind and is in a real, defensible, safe-to-
  // hand-back posture, even though full containment (and the
  // historical audit review) is not yet complete. This mirrors
  // Authorization Policy Rollout Failure's safe-degraded-noncritical
  // tier exactly: a genuine bounded tradeoff, not a disguised failure.
  //
  // ── Why fully-contained-unreviewed is ACCEPTABLE, not OPTIMAL ──────
  // credentialContainmentStatus reads "fully-contained" — the live
  // security/availability posture is fully safe and complete — but
  // auditReviewStatus still reads "unreviewed": the historical
  // reconstruction of what happened BEFORE and DURING the exposure
  // window (CI/CD artifact history, Logging history, Secret Manager
  // access logs) has never been done. This is a real, distinct gap in
  // the auditability business invariant ("every use of the exposed
  // credential after exposure was identified must be recorded as an
  // auditable historical fact") — live monitoring alone cannot
  // retroactively supply this, which is exactly why auditLogReviewCompleted
  // is a real, separately-gated control rather than a decorative one.
  //
  // ── Why the two UNSAFE families can never resolve, regardless of
  // how long they run or how good other metrics look ────────────────
  // fully-trusted-baseline/sustained fails successCondition's explicit
  // credentialContainmentStatus === "fully-contained" check (it reads
  // "trusted") AND acceptableCondition's explicit
  // credentialContainmentStatus !== "trusted" check — directly,
  // regardless of applicationRequestSuccessRate/
  // externalIntegrationSuccessRate both reading in the high 90s. The
  // broad-immediate-revocation family fails acceptableCondition's
  // explicit !== "broad-revoked-unsequenced" check AND its
  // externalIntegrationSuccessRate >= 99 check simultaneously — a
  // double, redundant-by-design failure, since this path is unsafe for
  // two independent reasons (an unsequenced security action AND a
  // self-inflicted availability regression). If the "do nothing" trap
  // is left active long enough (suspectedExposedCredentialUseCount >=
  // 40, sustained 45s — reachable via fully-trusted-sustained-exposure's
  // 46), the automatic failureCondition fires — failure is never
  // gated by completion mode (tick.ts), so a candidate cannot simply
  // decline to Finish and wait out a live, worsening exposure.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "genuinely contained but not yet audited" (ACCEPTABLE)
  // and "fully contained AND fully audited" (OPTIMAL) is a real system-
  // state distinction, but deciding WHETHER the acceptable bounded
  // tradeoff is safe enough to hand back — as opposed to continuing to
  // complete cohort migration and the historical audit review to reach
  // the OPTIMAL state — is a genuine Principal-level judgment call, not
  // something the engine should auto-resolve the instant a threshold is
  // crossed. This mirrors Identity Platform Degradation's and
  // Authorization Policy Rollout Failure's completion-mode reasoning
  // exactly.
  completion: { mode: "candidate_declared", acceptableCondition },
};
