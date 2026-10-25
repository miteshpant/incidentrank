import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { serviceToServiceCredentialRotationFailureRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
  CREDENTIAL_VALIDATION_MODE_KEY,
  NEW_CREDENTIAL_ACTIVATION_KEY,
  OLD_CREDENTIAL_VALIDITY_KEY,
  ROLLBACK_OLD_CREDENTIAL_KEY,
  ROTATION_COHORT_STAGE_KEY,
} from "./controls";

const TICK_MS = 1_000;

export const serviceToServiceCredentialRotationFailureSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [],
  numericWatchFields: [
    {
      key: "cumulativeUnauthenticatedCallCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage:
          "At least one call has been accepted with no authentication — a permanent historical consequence that will not be erased by any later fix.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further unauthenticated calls are currently being accepted.",
      },
    },
    {
      key: "serviceToServiceCallSuccessRate",
      trackPeak: false,
    },
    {
      key: "authenticationFailureRatePercent",
      trackPeak: true,
    },
    {
      key: "newCredentialAdoptionPercent",
      trackPeak: true,
    },
  ],
  timedEvents,
  rules: serviceToServiceCredentialRotationFailureRules,
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
  // authored values (serviceToServiceCallSuccessRate /
  // genuinelyAuthenticatedCallPercent / newCredentialAdoptionPercent /
  // rotationSafetyStatus / cumulativeUnauthenticatedCallCount):
  //
  //   healthy-default                     N/A (pre-incident)
  //   baseline-stalled                    UNSAFE  99.8/100/0/not-started/0
  //   activation-skipped                  UNSAFE  99.8/100/0/not-started/0
  //     (sequencing trap #2: cohort stage may claim progress, but
  //      newCredentialAdoptionPercent is pinned at 0 because the new
  //      credential was never activated on Service C — nothing was
  //      genuinely verified)
  //   activated-no-cohorts                UNSAFE  99.8/100/0/safe-overlap/0
  //   cohort1-verified-overlap            UNSAFE  99.8/100/35/safe-overlap/0
  //   cohort2-verified-overlap            UNSAFE  99.8/100/70/safe-overlap/0
  //   all-cohorts-verified-overlap        ACCEPTABLE 99.8/100/100/safe-overlap/0
  //   fully-rotated-safe                  OPTIMAL 99.9/100/100/fully-rotated/0
  //   premature-gap                       UNSAFE  61/100/0/premature-gap/0
  //   premature-gap-sustained             UNSAFE  42/100/0/premature-gap/0
  //   rollback-just-issued                UNSAFE  65/100/0/rolled-back-safe/0
  //   rollback-recovering-window1         UNSAFE  84/100/0/rolled-back-safe/0
  //   rollback-recovered                  UNSAFE* 99.7/100/0/rolled-back-safe/0
  //     (*fails successCondition's explicit rotationSafetyStatus ===
  //      "fully-rotated" check and acceptableCondition's "safe-overlap"
  //      check — rollback restores safety but does not, by itself,
  //      complete the rotation's cohort-verification goal; a candidate
  //      who rolls back must still go on to verify cohorts and
  //      eventually re-attempt revocation correctly to reach either
  //      real tier. This is intentional: "the gap is closed" and "the
  //      rotation is done" are different, both real, milestones.)
  //   bypass-preemptive                   UNSAFE  99.9/0/0/bypassed/150
  //   bypass-active                       UNSAFE  99.8/0/0/bypassed/180
  //   bypass-sustained                    UNSAFE  99.9/0/0/bypassed/640
  //
  // Every UNSAFE state fails successCondition/acceptableCondition for a
  // real, named reason: either rotationSafetyStatus never reached
  // "fully-rotated"/"safe-overlap", or newCredentialAdoptionPercent < 100
  // (cohorts genuinely incomplete), or genuinelyAuthenticatedCallPercent
  // < 100 (an active authentication-bypass violation — never acceptable
  // regardless of how healthy the call-success-rate metric looks, per
  // phase-6e-strategy-spec.md section 11's binding security-QA
  // requirement).
  //
  // ACCEPTABLE (all-cohorts-verified-overlap) is the ONE genuine
  // bounded tradeoff: every cohort has verified the new credential, the
  // old credential remains safely valid (never prematurely revoked,
  // never bypassed), genuinelyAuthenticatedCallPercent is 100, and
  // cumulativeUnauthenticatedCallCount is exactly 0 — this is a
  // deliberate, genuinely-safe handback (the rotation's functional goal
  // is complete; cleaning up the now-redundant old credential can
  // reasonably wait), never "almost fixed by coincidence."
  //
  // OPTIMAL (fully-rotated-safe) additionally requires the old
  // credential to have been safely revoked — reachable ONLY once
  // rotationCohortStage genuinely reached "all-cohorts-verified" with
  // newCredentialActivation having been true the entire time (both
  // sequencing traps closed), and credentialValidationMode still
  // "enforced" (the bypass rules win over this rule otherwise — see
  // rules.ts's authored ordering).
  //
  // ── Historical damage survives reaching OPTIMAL or ACCEPTABLE ──────
  // Every clean rule state above authors `values.cumulativeUnauthenticatedCallCount`
  // as 0 (the live field answers "is an unauthenticated call being
  // accepted RIGHT NOW"), but if this attempt ever passed through
  // bypass-active/bypass-sustained/bypass-preemptive,
  // state.peaks.peakValues.cumulativeUnauthenticatedCallCount (a
  // numericWatchField with trackPeak:true, computed generically by the
  // engine as Math.max every tick regardless of which rule currently
  // matches) remains permanently nonzero for the rest of the attempt —
  // it is never reset by reaching a clean rule state afterward. This is
  // the same non-self-resetting mechanism Identity Platform Degradation
  // and Authorization Policy Rollout Failure use for their own
  // historical counters, generalized rather than reinvented: whether an
  // unsafe bypass happened EARLIER in this attempt is a permanent scar
  // visible via peak tracking (and penalized by scoring's dataIntegrity
  // dimension at the moment bypass was actually active — see
  // scoring.ts), never a second completion gate re-litigating the past
  // on top of the live successCondition.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between genuine cohort progress (UNSAFE — incomplete) and
  // full cohort verification with safe overlap (ACCEPTABLE) is a real
  // system-state distinction, but deciding WHETHER to additionally
  // revoke the now-redundant old credential right now — versus leaving
  // the safe overlap window open a while longer before reaching the
  // OPTIMAL fully-rotated state — is a genuine Senior-Staff judgment
  // call about blast-radius and cleanup timing, not a threshold the
  // engine should auto-resolve the instant it's crossed. This mirrors
  // Identity Platform Degradation's and Authorization Policy Rollout
  // Failure's identical reasoning for their own acceptable/optimal
  // split.
  completion: { mode: "candidate_declared", acceptableCondition },
};
