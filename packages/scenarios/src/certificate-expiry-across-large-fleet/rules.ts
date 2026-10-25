import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  CERTIFICATE_OVERLAP_WINDOW_KEY,
  COHORT_ROLLOUT_STAGE_KEY,
  LEGACY_COMPATIBILITY_BRIDGE_KEY,
  LOAD_BALANCER_CERTIFICATE_MODE_KEY,
  OLD_CERTIFICATE_REVOCATION_TIMING_KEY,
  ROTATION_ORDER_KEY,
  TRUST_BUNDLE_UPDATE_STATUS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "certificate-authority": "healthy",
  "secret-distribution": "healthy",
  "service-fleet": "healthy",
  "load-balancers": "healthy",
  "external-clients": "healthy",
};

const rotatingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "service-fleet": "degraded",
  "secret-distribution": "degraded",
};

const expiryOutageHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "load-balancers": "critical",
  "external-clients": "critical",
};

const prematureGapHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "service-fleet": "critical",
  "load-balancers": "critical",
  "external-clients": "critical",
};

const bypassedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "load-balancers": "critical",
};

const recoveringHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "load-balancers": "degraded",
  "external-clients": "degraded",
};

/**
 * Authored rule table for Certificate Expiry Across Large Fleet.
 * ORDERING IS LOAD-BEARING (first-match-wins, top-to-bottom, see
 * packages/simulator/src/rules.ts's matchRule) — same discipline as
 * every Phase 6E sibling.
 *
 * Checked in this order:
 *   (1) UNSAFE validation-bypass trap — wins regardless of every other
 *       control, because a connection accepted with no genuine
 *       certificate validation is never acceptable no matter how
 *       healthy the success-rate metric looks.
 *   (2) SAFE fully-rotated end state (all cohorts verified, old
 *       certificate revoked, trust bundle verified) — checked before
 *       the generic premature-gap trap below for the same reason
 *       Service-to-Service Credential Rotation Failure's
 *       "fully-rotated-safe" rule is checked before its generic
 *       "revoked" trap: RuleCondition has no native not_equals for a
 *       multi-value control, so the only way to express "revoked AND
 *       genuinely ready" (safe) vs. "revoked AND NOT genuinely ready"
 *       (the trap) is ordering. Authored as two rules (one per
 *       rotationOrder value) so that control stays genuinely
 *       rule-referenced (zero dead controls) while both reach the
 *       byte-identical terminal state.
 *   (3) PREMATURE-REVOCATION SEQUENCING TRAP (the scenario's central,
 *       REQUIRED lesson) — old certificate revoked before Legacy's
 *       trust bundle is verified, or before every cohort's rollout has
 *       genuinely completed. The SAME eventual configuration reached in
 *       the wrong order is unsafe here, exactly per the brief.
 *   (4) RECOVERY-LAG after an ISOLATED premature gap (cohortRolloutStage
 *       still "not-started" — the candidate's only actions were
 *       creating and then closing the SAME gap) was closed the
 *       sanctioned way (restoring the old certificate's validity +
 *       verifying the trust bundle — never the bypass). Checked here,
 *       BEFORE the deterministic expiry-miss family, because it is
 *       strictly more specific (also requires trustBundleUpdateStatus
 *       genuinely verified) — this is what keeps a candidate who is
 *       actively, correctly recovering from a self-inflicted gap from
 *       ever being misclassified as "never attempted anything" merely
 *       because enough calendar time elapsed for the deadline to also
 *       pass in the meantime.
 *   (5) FALSE-CLAIM GUARD (pre-deadline only) — cohortRolloutStage
 *       advanced past "not-started" WITHOUT certificateOverlapWindow
 *       ever being opened. Nothing was genuinely verified.
 *   (6) DETERMINISTIC EXPIRY-DEADLINE-MISS states — calendar time ran
 *       out on a cohort that was never rotated, INCLUDING the
 *       overlap-never-opened false claim once the deadline exposes it.
 *       Never a random failure. Every reachable cohortRolloutStage
 *       value (not-started / modern-rotated / critical-rotated /
 *       legacy-bridged / all-cohorts-rotated-but-overlap-never-opened)
 *       has its own explicit rule here — two of these (critical-
 *       rotated, legacy-bridged) and the overlap-never-opened one were
 *       real default-value fallthrough defects found and fixed by this
 *       scenario's own completeness audit (the exact #90/#91 lesson).
 *   (7) SAFE STAGED ROTATION PROGRESS — old certificate NOT revoked
 *       (safe overlap maintained), cohorts rotating in stages,
 *       certificateOverlapWindow genuinely open. all-cohorts-rotated's
 *       own safe rule here is deliberately deadline-agnostic (see its
 *       own doc comment) — every cohort is already safe regardless of
 *       whether the calendar deadline has since passed.
 *   (8) FALSE-BRIDGE / FALSE-VERIFICATION traps — a cohort claimed
 *       "rotated" without the prerequisite real mechanism engaged.
 *   (9) Baseline / deadline-risk-unaddressed / healthy-default.
 *
 * ROOT CAUSE: a large TLS certificate fleet, spanning three cohorts
 * (Modern, Critical, Legacy) with genuinely different rotation
 * capability/rollout speed/dependency risk, is approaching a shared
 * expiry deadline. Nothing external fails anything — this is a
 * proactive, calendar-driven remediation. loadBalancerConnectionSuccess-
 * RatePercent stays at its healthy baseline for days of simulated
 * calendar time while the deadline clock runs down — exactly this
 * batch's "healthy dashboard hides the real problem" pattern, expressed
 * on a DEADLINE-RISK axis (how much calendar time is left per cohort)
 * rather than a live resource-exhaustion axis.
 *
 * CENTRAL JUDGMENT (business invariants, see definition.ts): the
 * Critical cohort may never cross the expiry deadline un-rotated; a new
 * certificate must be verifiably installed before the old one is
 * withdrawn; the Legacy cohort may require a temporary overlap bridge
 * because its dependency chain updates its trust bundle more slowly;
 * broad validation bypass is never an acceptable way to paper over
 * either an expiry or a premature-revocation gap; deadline risk must be
 * tracked explicitly per cohort, never averaged into one fleet-wide
 * number that could hide which specific cohort is actually at risk.
 *
 * REQUIRED SEQUENCING TRAP (binding — this scenario's defining lesson):
 * revoking the old certificate (oldCertificateRevocationTiming=
 * "revoked") BEFORE the Legacy cohort's trust bundle is verified
 * (trustBundleUpdateStatus !== "updated-and-verified") breaks Legacy
 * clients even though BOTH the revocation and the trust-bundle update
 * eventually happen in this timeline — the SAME eventual configuration
 * reached in the wrong order is unsafe, never merely "slower." See
 * "premature-gap-*" rules below, and the dedicated reordering test in
 * this scenario's test file proving the exact same two actions in
 * swapped order produce a genuinely different (unsafe vs. safe) result.
 *
 * ALTERNATE STRONG PATHS (both reach OPTIMAL once genuinely engaged and
 * drained — see the alternate-strong-path audit in the completion
 * report):
 *   A. modern-first (rotationOrder default): Modern cohort (fastest
 *      capability, lowest dependency risk) rotated first, then
 *      Critical, then Legacy bridged last.
 *   B. critical-first: Critical cohort (the one that may NEVER cross
 *      the deadline) rotated first, retiring the single highest-
 *      consequence risk earliest, at the cost of leaving Modern's
 *      larger population un-rotated slightly longer. Both are
 *      operationally defensible; rotationOrder never gates correctness
 *      on its own — cohortRolloutStage's actual sequence of real,
 *      verified per-cohort progress is what the engine tracks, and
 *      rotationOrder is read by revenue-and-cost.ts/candidate-ui only
 *      as the declared strategy label, exactly like every other
 *      strategy-only control in this batch's siblings.
 *
 * DEFAULT-VALUE PATH COMPLETENESS (binding): every safe strategy below
 * is enumerated so that leaving rotationOrder OR certificateOverlap-
 * Window at its untouched default never falls through to an unintended
 * baseline/unsafe state purely from elapsed calendar time — see the
 * explicit per-combination audit in this scenario's completion report
 * and the matching permanent regression tests.
 */
export const certificateExpiryAcrossLargeFleetRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE VALIDATION-BYPASS TRAP — checked first: wins regardless of
  // every other control, because a connection accepted with no genuine
  // certificate validation is never acceptable, expired cohort or not.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "bypass-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, sustainedPostExpiry: true },
      controlEquals: { [LOAD_BALANCER_CERTIFICATE_MODE_KEY]: "validation-bypass-all" },
    },
    incidentState: "bypass-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.9,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "validation-bypassed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 760,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: bypassedHealth,
  },
  {
    id: "bypass-active",
    when: {
      triggerEquals: { expiryWindowActive: true },
      controlEquals: { [LOAD_BALANCER_CERTIFICATE_MODE_KEY]: "validation-bypass-all" },
    },
    incidentState: "bypass-active",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.8,
      modernCohortDaysToExpiry: 1,
      criticalCohortDaysToExpiry: 1,
      legacyCohortDaysToExpiry: 1,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "validation-bypassed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 210,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: bypassedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE FULLY-ROTATED END STATE — every cohort genuinely verified,
  // trust bundle verified, old certificate revoked, validation
  // enforced. Checked BEFORE the generic premature-gap trap below (see
  // module doc comment's ordering note).
  // ══════════════════════════════════════════════════════════════════
  // Authored as two explicit rules (one per rotationOrder value) rather
  // than one rule that ignores rotationOrder entirely: both reach the
  // byte-identical terminal state (proving rotationOrder never gates
  // correctness — see the alternate-strong-path test), but each rule
  // genuinely matches on — and is therefore load-bearing for —
  // rotationOrder's actual value, keeping this control a real,
  // rule-referenced lever rather than a candidate-ui-only cosmetic
  // label (this batch's zero-dead-controls discipline).
  {
    id: "fully-rotated-safe-modern-first",
    when: {
      triggerEquals: { expiryWindowActive: true },
      controlEquals: {
        [ROTATION_ORDER_KEY]: "modern-first",
        [COHORT_ROLLOUT_STAGE_KEY]: "all-cohorts-rotated",
        [TRUST_BUNDLE_UPDATE_STATUS_KEY]: "updated-and-verified",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "revoked",
        [LOAD_BALANCER_CERTIFICATE_MODE_KEY]: "standard-validation",
      },
    },
    incidentState: "fully-rotated-safe",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "verified-rotated",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-rotated-safe-critical-first",
    when: {
      triggerEquals: { expiryWindowActive: true },
      controlEquals: {
        [ROTATION_ORDER_KEY]: "critical-first",
        [COHORT_ROLLOUT_STAGE_KEY]: "all-cohorts-rotated",
        [TRUST_BUNDLE_UPDATE_STATUS_KEY]: "updated-and-verified",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "revoked",
        [LOAD_BALANCER_CERTIFICATE_MODE_KEY]: "standard-validation",
      },
    },
    incidentState: "fully-rotated-safe",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "verified-rotated",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PREMATURE-REVOCATION SEQUENCING TRAP — old certificate revoked
  // before every cohort's rollout genuinely completed, OR (the
  // defining, required case) before Legacy's trust bundle was verified
  // specifically. Validation is still enforced here (no security
  // violation — purely a sequencing-driven availability consequence);
  // the bypass rules above already caught the case where validation was
  // also disabled.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "premature-gap-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, sustainedPostExpiry: true },
      controlEquals: { [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "revoked" },
    },
    incidentState: "premature-gap-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 38,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "premature-gap-outage",
      cumulativeRejectedConnectionCount: 900,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: prematureGapHealth,
  },
  {
    id: "premature-gap",
    when: {
      triggerEquals: { expiryWindowActive: true },
      controlEquals: { [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "revoked" },
    },
    incidentState: "premature-gap",
    values: {
      loadBalancerConnectionSuccessRatePercent: 58,
      modernCohortDaysToExpiry: 1,
      criticalCohortDaysToExpiry: 1,
      legacyCohortDaysToExpiry: 1,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "premature-gap-outage",
      cumulativeRejectedConnectionCount: 240,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: prematureGapHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // RECOVERY LAG — a premature gap was properly closed via the
  // sanctioned fix (old certificate restored to "not-revoked" AND
  // Legacy's trust bundle genuinely verified), WITHOUT ever having
  // touched cohortRolloutStage otherwise (still "not-started" — the
  // candidate's only actions were causing and then fixing the gap
  // itself). Already-rejecting External Client populations reconnect
  // only across real elapsed-time windows, never instantly. Checked
  // explicitly BEFORE the deterministic expiry-deadline-miss family
  // below — more specific (also requires trustBundleUpdateStatus
  // genuinely verified, which the generic expiry-miss rules do not
  // check at all) — so a candidate who is actively, correctly
  // recovering from a self-inflicted gap is never misclassified as
  // "never attempted anything" merely because enough calendar time
  // elapsed for the deadline to also pass in the meantime. The explicit
  // cohortRolloutStage:"not-started" constraint is what keeps this
  // family from ever shadowing genuine partial/full cohort-rotation
  // progress elsewhere in the table (see the dedicated
  // false-trust-bundle-claim-no-rollout-reachable-without-a-real-gap
  // regression test in this scenario's test file, proving this family
  // is reserved for an ACTUAL revoke-then-restore sequence, not a
  // cosmetic trust-bundle flip with nothing else ever touched).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "gap-fully-recovered",
    when: {
      triggerEquals: { expiryWindowActive: true, gapRecoveryFullyDone: true },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "not-started",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
        [TRUST_BUNDLE_UPDATE_STATUS_KEY]: "updated-and-verified",
      },
    },
    incidentState: "gap-recovered",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.85,
      modernCohortDaysToExpiry: 1,
      criticalCohortDaysToExpiry: 1,
      legacyCohortDaysToExpiry: 1,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "gap-recovering-window1",
    when: {
      triggerEquals: { expiryWindowActive: true, gapRecoveryWindow1Elapsed: true, gapRecoveryFullyDone: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "not-started",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
        [TRUST_BUNDLE_UPDATE_STATUS_KEY]: "updated-and-verified",
      },
    },
    incidentState: "gap-recovering-window1",
    values: {
      loadBalancerConnectionSuccessRatePercent: 80,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 240,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "warning",
    },
    componentHealth: recoveringHealth,
  },
  {
    id: "gap-just-rolled-back",
    when: {
      triggerEquals: { expiryWindowActive: true },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "not-started",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
        [TRUST_BUNDLE_UPDATE_STATUS_KEY]: "updated-and-verified",
      },
    },
    incidentState: "gap-just-rolled-back",
    values: {
      loadBalancerConnectionSuccessRatePercent: 62,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 240,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "warning",
    },
    componentHealth: recoveringHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // FALSE-CLAIM GUARD — cohortRolloutStage advanced past "not-started"
  // WITHOUT the fleet-wide certificateOverlapWindow ever having been
  // opened. Nothing was genuinely verified: a cohort "rotated" against
  // a mechanism that was never engaged is not a real rotation, exactly
  // the same false-claim family as false-bridge-legacy-not-engaged
  // below. REQUIRED — without this, a candidate who advances
  // cohortRolloutStage while leaving certificateOverlapWindow at its
  // untouched "closed" default would otherwise fall through every
  // safe-progress rule (all of which require certificateOverlapWindow:
  // "open") AND every expiry-deadline-missed rule authored for THIS
  // batch's own fallthrough fix (those are gated to specific
  // combinations too), all the way to the healthy-default fallback —
  // precisely the #90/#91-class default-value completeness bug this
  // batch exists to catch, found by this scenario's own exhaustive
  // audit sweep and fixed here. Checked for BOTH oldCertificateRevocationTiming
  // values is unnecessary — "revoked" is already caught earlier by the
  // premature-gap family — so this only needs "not-revoked".
  // Deliberately NO expiryDeadlinePassed constraint: a false claim is
  // false at every point in the timeline, not just before the
  // deadline.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "false-claim-overlap-never-opened-all-cohorts",
    when: {
      triggerEquals: { expiryWindowActive: true , expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "all-cohorts-rotated",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "closed",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "false-claim-overlap-never-opened",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "deadline-risk-unaddressed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "false-claim-overlap-never-opened-legacy-bridged",
    when: {
      triggerEquals: { expiryWindowActive: true , expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "legacy-bridged",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "closed",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "false-claim-overlap-never-opened",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "deadline-risk-unaddressed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "false-claim-overlap-never-opened-critical-rotated",
    when: {
      triggerEquals: { expiryWindowActive: true , expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "critical-rotated",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "closed",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "false-claim-overlap-never-opened",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "deadline-risk-unaddressed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
  {
    id: "false-claim-overlap-never-opened-modern-rotated",
    when: {
      triggerEquals: { expiryWindowActive: true , expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "modern-rotated",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "closed",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "false-claim-overlap-never-opened",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "deadline-risk-unaddressed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // DETERMINISTIC EXPIRY-DEADLINE-MISS — calendar time ran out
  // (expiryDeadlinePassed) on a fleet where rollout never genuinely
  // completed and the old certificate was never revoked (so this is a
  // real EXPIRY, not a premature-revocation gap — those are caught
  // above). Never a random failure: this is the direct, deterministic
  // consequence of calendar time passing with the Certificate Authority's
  // old certificates past their own validity window.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "expiry-deadline-missed-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true, sustainedPostExpiry: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "not-started" },
    },
    incidentState: "expiry-deadline-missed-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 22,
      modernCohortDaysToExpiry: -1,
      criticalCohortDaysToExpiry: -1,
      legacyCohortDaysToExpiry: -1,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 1_400,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  {
    id: "expiry-deadline-missed",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "not-started" },
    },
    incidentState: "expiry-deadline-missed",
    values: {
      loadBalancerConnectionSuccessRatePercent: 45,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 480,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  // ── Partial-rotation expiry miss: SOME cohorts rotated but not all,
  // and the deadline passed before the rest finished — Critical cohort
  // specifically must never reach this (business invariant #1); this
  // rule covers the case where it was Modern/Legacy left behind instead
  // (still a real, counted violation, just a smaller blast radius than
  // leaving every cohort un-rotated).
  {
    id: "expiry-deadline-missed-partial-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true, sustainedPostExpiry: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "modern-rotated" },
    },
    incidentState: "expiry-deadline-missed-partial-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 55,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: -1,
      legacyCohortDaysToExpiry: -1,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 950,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  {
    id: "expiry-deadline-missed-partial",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "modern-rotated" },
    },
    incidentState: "expiry-deadline-missed-partial",
    values: {
      loadBalancerConnectionSuccessRatePercent: 66,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 320,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  // ── Partial-rotation expiry miss, critical-rotated: Critical's own
  // deadline risk was retired in time (business invariant #1 honored),
  // but Modern and Legacy were left un-rotated and the deadline passed
  // on them — still a real, counted violation, REQUIRED to be covered
  // explicitly (without it, this exact combination would otherwise fall
  // all the way through every rule below to the healthy-default
  // fallback once expiryDeadlinePassed flips true — precisely the
  // #90/#91-class default-value fallthrough bug this batch exists to
  // catch, caught here by this scenario's own completeness audit).
  {
    id: "expiry-deadline-missed-critical-rotated-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true, sustainedPostExpiry: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "critical-rotated" },
    },
    incidentState: "expiry-deadline-missed-critical-rotated-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 60,
      modernCohortDaysToExpiry: -1,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: -1,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 900,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  {
    id: "expiry-deadline-missed-critical-rotated",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "critical-rotated" },
    },
    incidentState: "expiry-deadline-missed-critical-rotated",
    values: {
      loadBalancerConnectionSuccessRatePercent: 70,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 300,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  // ── Partial-rotation expiry miss, legacy-bridged: Modern AND Critical
  // both genuinely rotated (their own deadline risk fully retired), but
  // the Legacy bridge was only ever opened, never carried through to a
  // genuinely completed, fully-verified fleet — REQUIRED for the exact
  // same default-value completeness reason as critical-rotated above.
  {
    id: "expiry-deadline-missed-legacy-bridged-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true, sustainedPostExpiry: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "legacy-bridged" },
    },
    incidentState: "expiry-deadline-missed-legacy-bridged-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 75,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: -1,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 450,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  {
    id: "expiry-deadline-missed-legacy-bridged",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "legacy-bridged" },
    },
    incidentState: "expiry-deadline-missed-legacy-bridged",
    values: {
      loadBalancerConnectionSuccessRatePercent: 82,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 150,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  // ── all-cohorts-rotated CLAIMED, but certificateOverlapWindow was
  // NEVER opened (the false-claim guard above only covers the
  // pre-deadline window — see its own doc comment): once the deadline
  // actually passes, this false claim is exposed as a genuine, real
  // expiry outage exactly like leaving cohortRolloutStage at
  // "not-started" the whole time — REQUIRED for the exact same
  // default-value completeness reason as every other
  // expiry-deadline-missed-* rule above (found by this scenario's own
  // exhaustive audit sweep).
  {
    id: "expiry-deadline-missed-false-claim-all-cohorts-sustained",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true, sustainedPostExpiry: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "all-cohorts-rotated", [CERTIFICATE_OVERLAP_WINDOW_KEY]: "closed" },
    },
    incidentState: "expiry-deadline-missed-false-claim-all-cohorts-sustained",
    values: {
      loadBalancerConnectionSuccessRatePercent: 22,
      modernCohortDaysToExpiry: -1,
      criticalCohortDaysToExpiry: -1,
      legacyCohortDaysToExpiry: -1,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 1_400,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },
  {
    id: "expiry-deadline-missed-false-claim-all-cohorts",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: true },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "all-cohorts-rotated", [CERTIFICATE_OVERLAP_WINDOW_KEY]: "closed" },
    },
    incidentState: "expiry-deadline-missed-false-claim-all-cohorts",
    values: {
      loadBalancerConnectionSuccessRatePercent: 45,
      modernCohortDaysToExpiry: 0,
      criticalCohortDaysToExpiry: 0,
      legacyCohortDaysToExpiry: 0,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "expiry-outage",
      cumulativeRejectedConnectionCount: 480,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "critical",
    },
    componentHealth: expiryOutageHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // SAFE STAGED ROTATION PROGRESS — old certificate NOT revoked (safe
  // overlap maintained the entire time), fleet-wide overlap window
  // open, cohorts rotating in genuine, verified stages. Checked BEFORE
  // the recovery-lag rules below so legitimate cohort progress is never
  // shadowed by a stale rollback-adjacent flag. Deadline has NOT yet
  // passed in this family (expiryDeadlinePassed: false) — the
  // deadline-miss rules above already cover what happens if time runs
  // out first.
  // ══════════════════════════════════════════════════════════════════
  {
    // Deliberately NO expiryDeadlinePassed constraint (matches whether
    // the deadline has passed or not): every cohort is already
    // verifiably rotated with its OWN new certificate before this
    // rule's values are read, so the fleet-wide calendar deadline
    // passing afterward changes nothing real — every cohort's
    // deadline risk was already retired. Requiring
    // expiryDeadlinePassed:false here would be the exact #90/#91-class
    // default-value fallthrough bug (a genuinely safe, fully-completed
    // strategy losing its safe state purely because enough elapsed
    // time passed) — see this scenario's completeness audit.
    id: "all-cohorts-rotated-not-yet-revoked",
    when: {
      triggerEquals: { expiryWindowActive: true },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "all-cohorts-rotated",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "open",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "all-cohorts-rotated-overlap",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.9,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "verified-rotated",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: rotatingHealth,
  },
  {
    id: "legacy-bridged-progress",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "legacy-bridged",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "open",
        [LEGACY_COMPATIBILITY_BRIDGE_KEY]: "on",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "legacy-bridged-progress",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.85,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "verified-rotated",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "updated-and-verified",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: rotatingHealth,
  },
  {
    id: "critical-rotated-progress",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "critical-rotated",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "open",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "critical-rotated-progress",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.8,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: rotatingHealth,
  },
  {
    id: "modern-rotated-progress",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "modern-rotated",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "open",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "modern-rotated-progress",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.8,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: rotatingHealth,
  },
  // ── Overlap window opened, no cohort rotated yet: safe but no real
  // progress — the overlap mechanism is ready but adoption has not
  // actually started on any cohort.
  {
    id: "overlap-opened-no-progress",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "not-started",
        [CERTIFICATE_OVERLAP_WINDOW_KEY]: "open",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "overlap-opened-no-progress",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.9,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: rotatingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // FALSE-BRIDGE TRAP — cohortRolloutStage claims "legacy-bridged"
  // without legacyCompatibilityBridge actually engaged. Nothing was
  // really bridged: Legacy's genuinely slower trust-bundle propagation
  // has no real overlap mechanism backing the claim. Matches whenever
  // legacyCompatibilityBridge is "off" and the old certificate has not
  // been revoked (so this only catches the false-bridge case, not the
  // premature-revocation case already caught above).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "false-bridge-legacy-not-engaged",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: false },
      controlEquals: {
        [COHORT_ROLLOUT_STAGE_KEY]: "legacy-bridged",
        [LEGACY_COMPATIBILITY_BRIDGE_KEY]: "off",
        [OLD_CERTIFICATE_REVOCATION_TIMING_KEY]: "not-revoked",
      },
    },
    incidentState: "false-bridge-legacy-not-engaged",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.8,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "verified-rotated",
      criticalCohortRotationStatus: "verified-rotated",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: rotatingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // DEADLINE RISK, UNADDRESSED — the expiry window is active, the
  // deadline has not yet passed, and NO rotation progress has been made
  // at all (cohortRolloutStage still "not-started", the untouched
  // default). REQUIRED to be distinct from "nominal": per the binding
  // long-horizon design requirement, "a green system must never equal a
  // safe handback if deadline/risk remains unresolved." Without this
  // rule, a zero-action attempt would fall through to healthy-default
  // below (fleetConnectionStatus: "nominal") and, given enough elapsed
  // calendar time pre-deadline, would spuriously accumulate
  // consecutiveAcceptableSeconds and become Finish-eligible despite
  // nothing having been remediated — exactly the kind of fallthrough
  // this batch's default-value path completeness requirement exists to
  // catch. fleetConnectionStatus reads "deadline-risk-unaddressed" here
  // instead, which satisfies neither successCondition nor
  // acceptableCondition (both require "nominal").
  // ══════════════════════════════════════════════════════════════════
  {
    id: "deadline-risk-unaddressed",
    when: {
      triggerEquals: { expiryWindowActive: true, expiryDeadlinePassed: false },
      controlEquals: { [COHORT_ROLLOUT_STAGE_KEY]: "not-started" },
    },
    incidentState: "deadline-risk-unaddressed",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 2,
      criticalCohortDaysToExpiry: 2,
      legacyCohortDaysToExpiry: 2,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "deadline-risk-unaddressed",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },

  // ── Default/fallback: before the deadline window begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      loadBalancerConnectionSuccessRatePercent: 99.95,
      modernCohortDaysToExpiry: 3,
      criticalCohortDaysToExpiry: 3,
      legacyCohortDaysToExpiry: 3,
      modernCohortRotationStatus: "pending",
      criticalCohortRotationStatus: "pending",
      legacyCohortRotationStatus: "pending",
      fleetConnectionStatus: "nominal",
      cumulativeRejectedConnectionCount: 0,
      cumulativeValidationBypassedConnectionCount: 0,
      legacyTrustBundleVerifiedStatus: "pending",
      fleetConnectionSeverity: "normal",
    },
    componentHealth: healthyHealth,
  },
];
