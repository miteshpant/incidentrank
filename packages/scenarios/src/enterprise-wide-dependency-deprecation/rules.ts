import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  COMPATIBILITY_LAYER_MODE_KEY,
  DEADLINE_ESCALATION_MODE_KEY,
  DEPRECATED_API_TRAFFIC_BLOCK_KEY,
  DUAL_SUPPORT_MODE_KEY,
  MIGRATION_COHORT_ORDER_KEY,
  MIGRATION_VERIFICATION_MODE_KEY,
  PRODUCT_A_MIGRATION_KEY,
  PRODUCT_B_MIGRATION_KEY,
  PRODUCT_C_MIGRATION_KEY,
  PRODUCT_D_MIGRATION_KEY,
  REPLACEMENT_TRAFFIC_PERCENT_KEY,
  ROLLBACK_READINESS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  "product-a": "healthy",
  "product-b": "healthy",
  "product-c": "healthy",
  "product-d": "healthy",
  "shared-sdk": "healthy",
  "migration-coordinator": "healthy",
  "compatibility-layer": "healthy",
  "deprecated-external-api": "healthy",
  "replacement-api": "healthy",
};

// Product C is the only node ever "critical" purely from its own
// compatibility blocker (independent of the deadline) — the Compatibility
// Layer is "degraded" (not yet activated to unblock it) while C remains
// blocked.
const productCBlockedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "product-c": "critical",
  "compatibility-layer": "degraded",
};

const partialProgressHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "product-c": "degraded",
  "compatibility-layer": "degraded",
  "migration-coordinator": "degraded",
};

const deadlineBreachedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "product-a": "critical",
  "product-b": "critical",
  "product-c": "critical",
  "product-d": "critical",
  "shared-sdk": "critical",
  "deprecated-external-api": "critical",
  "migration-coordinator": "critical",
};

const forcedCutoverFailureHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "product-c": "critical",
  "shared-sdk": "critical",
  "migration-coordinator": "critical",
};

const lingeringDebtHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "compatibility-layer": "degraded",
  "migration-coordinator": "degraded",
};

/**
 * Authored rule table for Enterprise-Wide Dependency Deprecation (the
 * Phase 6E flagship), ordered most-specific/most-dangerous-first
 * (first-match-wins, top-to-bottom).
 *
 * ROOT SITUATION: the Deprecated External API has a hard, known
 * deprecation deadline (see timed-events.ts's deterministic phase
 * checkpoints). At incident start the four products are already at
 * different real migration stages — Product A migrated but NEVER
 * independently verified, Product B partially migrated, Product C
 * blocked by a genuine compatibility issue with the Replacement API,
 * Product D fully untouched. Nothing here is a classic outage: every
 * live traffic-serving metric can read fully healthy for a long time
 * while the real problem — ungoverned, unverified, or stalled migration
 * against an approaching hard deadline — compounds untouched.
 *
 * FLAGSHIP CONSTRAINT (binding, verified explicitly by this scenario's
 * own test suite): no single control and no single product's migration
 * resolves this scenario. The only rule below that reaches OPTIMAL
 * requires ALL FOUR products independently set to "migrate" AND
 * migrationVerificationMode="verify-before-complete" AND
 * compatibilityLayerMode="active" (the only way Product C's real
 * blocker is actually cleared) AND replacementTrafficPercent=100 AND
 * deprecatedApiTrafficBlock="blocked" AND rollbackReadiness="prepared"
 * — nine independent controls, all genuinely required, none of which
 * alone (nor "migrate everything + Finish immediately") is sufficient,
 * because EVERY ONE of the three recovery-lag windows below
 * (verification / compatibility-convergence / traffic-drain) must also
 * have genuinely elapsed. See this scenario's test suite for an explicit
 * "migrate everything then Finish immediately" attempt proven to land on
 * an UNSAFE/unverified state, never OPTIMAL.
 *
 * DEFAULT-VALUE COMPLETENESS (binding batch requirement): migrationCohortOrder
 * and dualSupportMode are DELIBERATE EXCEPTIONS to the controls listed
 * above — neither is ever referenced in ANY rule's `when` clause in this
 * table. Both alternate strong paths (A: compatibility-layer-first
 * staged migration via migrationCohortOrder="prerequisite-first",
 * dualSupportMode left at its untouched default "disabled"; B:
 * product-by-product migration with targeted temporary dual-support via
 * dualSupportMode="enabled" then back to "disabled", migrationCohortOrder
 * left at its untouched default "unordered") reach the EXACT SAME
 * terminal OPTIMAL rule below, because that rule's `when` never
 * constrains either control. This is the direct, deliberate fix for the
 * #90/#91-class defect this batch must avoid: if the OPTIMAL rule
 * instead required migrationCohortOrder to be non-default, Strategy B
 * (which never touches it) would fall through to an unintended state
 * purely from leaving a legitimately-optional control at default.
 * migrationCohortOrder/dualSupportMode are NOT dead controls despite
 * never gating a rule's `when` — both are read directly in every rule's
 * authored `values` below (migrationGovernanceStatus/dualSupportStatus),
 * exercised by action-classifications.ts, and read by scoring.ts's
 * operationalEfficiency/costEfficiency dimensions via finalStringEquals/
 * numeric debt counters. See the completion report's control-usage audit
 * table for the full accounting.
 *
 * REQUIRED TEMPTING-BUT-UNSAFE TRAPS (all five, non-negotiable for the
 * flagship):
 *   1. "mark-migrated-without-verification" — all four products flipped
 *      to "migrate" under migrationVerificationMode="skip-verification".
 *      Every productsMigratedUnverifiedCount reads a large number and
 *      LOOKS complete, but productsMigratedVerifiedCount stays 0 and
 *      Product C's real compatibility blocker is never actually cleared
 *      (its control says "migrate" but its derived status still reads
 *      "blocked-incompatible" — skip-verification skips the CHECK, not
 *      the real technical blocker).
 *   2. "migrate-all-at-once-no-staging" — mechanically the identical
 *      state as (1): nothing in this engine lets "simultaneously" be
 *      distinguished from "sequentially" other than elapsed time between
 *      actions, and no sequenced, verified path ever passes through this
 *      state — it's the same authored trap rule, reachable the instant
 *      all four controls are set this way regardless of order.
 *   3. "dual-support-left-indefinite" — dualSupportMode left "enabled"
 *      long after every product has already reached migrated-verified;
 *      a real, independently-tracked, non-resetting debt counter (see
 *      dualSupportDebtAccumulatedMs), never silently absorbed into a
 *      clean OPTIMAL state.
 *   4. "wait-too-long-deadline-breach" — the deadline phases progress
 *      all the way to DEADLINE_MS with no candidate action at all; every
 *      live traffic metric reads healthy right up until the external
 *      deadline hits, at which point whatever still depends on the
 *      deprecated path breaks for real. The classic "green dashboard
 *      hides the approaching deadline" trap.
 *   5. "forced-cutover-with-incompatible-product" —
 *      deadlineEscalationMode="forced-cutover" while at least one
 *      product (almost always Product C, structurally blocked) remains
 *      incompatible. Immediately and permanently increments
 *      failedForcedCutoverCount — a real, counted, non-resetting failure
 *      event, even after the candidate backs the lever off again.
 *
 * REQUIRED ALTERNATE STRONG PATHS (both reach the same OPTIMAL rule —
 * see "OPTIMAL FAMILY" below and this scenario's completion report for
 * the explicit score-integrity audit proving neither scores below any
 * ACCEPTABLE path):
 *   A. Compatibility-layer-first staged migration: activate the
 *      Compatibility Layer and clear Product C's real blocker FIRST
 *      (migrationCohortOrder="prerequisite-first"), then migrate the
 *      remaining cohorts, verify everything, drain traffic, block the
 *      deprecated path, prepare rollback. dualSupportMode stays at its
 *      untouched default "disabled" throughout — this path never needs
 *      a dual-write bridge because each product's cutover is staged
 *      directly.
 *   B. Product-by-product direct migration with targeted, temporary
 *      dual-support: enable dualSupportMode while migrating each product
 *      one at a time, then disable it again once every product has
 *      genuinely finished. migrationCohortOrder stays at its untouched
 *      default "unordered" throughout — this path never needs formal
 *      cohort sequencing because dual-support itself is what makes each
 *      product's individual cutover safe.
 */
export const enterpriseWideDependencyDeprecationRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS/GOVERNANCE TRAPS — checked first: win regardless
  // of every other control, because each represents a real, live
  // violation of a business invariant.
  // ══════════════════════════════════════════════════════════════════

  // Trap 5: forced cutover while Product C (structurally blocked unless
  // the Compatibility Layer is active) remains incompatible. Checked
  // ahead of every other rule in this table — deadline pressure panic
  // can strike at any migration stage.
  {
    id: "forced-cutover-with-incompatible-product",
    when: {
      triggerEquals: { deadlineAnnounced: true },
      controlEquals: {
        [DEADLINE_ESCALATION_MODE_KEY]: "forced-cutover",
        [PRODUCT_C_MIGRATION_KEY]: "not-migrated",
      },
    },
    incidentState: "forced-cutover-with-incompatible-product",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 0,
      replacementApiErrorRate: 62,
      compatibilityExceptionsCount: 240,
      deadlineRiskStatus: "critical",
      deadlineRiskSeverity: "critical",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "forced-cutover-failure",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 1,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: forcedCutoverFailureHealth,
  },

  // Trap 1/2: mark-migrated-without-verification / migrate-all-at-once —
  // every product flipped to "migrate" but verification skipped fleet-
  // wide. Looks complete on the surface-level migrated-product controls
  // but productsMigratedVerifiedCount never moves off 0, and Product C's
  // real compatibility blocker is never actually cleared regardless of
  // what its control says, UNLESS the Compatibility Layer is genuinely
  // active (see the two variants below — the trap is sharper when it
  // isn't, since Product C's derived status still honestly reads
  // "blocked-incompatible" rather than merely "unverified").
  {
    id: "mark-all-migrated-no-verification-compat-inactive",
    when: {
      triggerEquals: { deadlineAnnounced: true },
      controlEquals: {
        [PRODUCT_A_MIGRATION_KEY]: "migrate",
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "skip-verification",
        [COMPATIBILITY_LAYER_MODE_KEY]: "inactive",
      },
    },
    incidentState: "mark-all-migrated-no-verification-compat-inactive",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "migrated-unverified",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "migrated-unverified",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 3,
      deprecatedApiTrafficPercent: 45,
      replacementApiErrorRate: 38,
      compatibilityExceptionsCount: 310,
      deadlineRiskStatus: "critical",
      deadlineRiskSeverity: "critical",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "complete-with-gaps",
      missedVerificationCount: 4,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: forcedCutoverFailureHealth,
  },
  {
    id: "mark-all-migrated-no-verification-compat-active",
    when: {
      triggerEquals: { deadlineAnnounced: true },
      controlEquals: {
        [PRODUCT_A_MIGRATION_KEY]: "migrate",
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "skip-verification",
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
      },
    },
    incidentState: "mark-all-migrated-no-verification-compat-active",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "migrated-unverified",
      productCMigrationStatus: "migrated-unverified",
      productDMigrationStatus: "migrated-unverified",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 4,
      deprecatedApiTrafficPercent: 30,
      replacementApiErrorRate: 22,
      compatibilityExceptionsCount: 190,
      deadlineRiskStatus: "critical",
      deadlineRiskSeverity: "critical",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "complete-with-gaps",
      missedVerificationCount: 4,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: {
      ...healthyHealth,
      "migration-coordinator": "degraded",
    },
  },

  // Trap 3: dual-support left indefinitely — every product has already
  // genuinely reached migrated-verified (the real, fully-verified safe
  // state), but dualSupportMode is still "enabled" long past the point
  // it was last needed, and dualSupportLingerWindowElapsed has fired.
  // Checked ahead of the OPTIMAL family below precisely because leaving
  // this lever on is never itself optimal, however correctly everything
  // else was done.
  {
    id: "dual-support-left-indefinite",
    when: {
      triggerEquals: {
        deadlineAnnounced: true,
        verificationWindowElapsed: true,
        compatibilityConvergenceWindowElapsed: true,
        trafficDrainWindowElapsed: true,
        dualSupportLingerWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_A_MIGRATION_KEY]: "migrate",
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
        [REPLACEMENT_TRAFFIC_PERCENT_KEY]: 100,
        [DEPRECATED_API_TRAFFIC_BLOCK_KEY]: "blocked",
        [DUAL_SUPPORT_MODE_KEY]: "enabled",
      },
    },
    incidentState: "dual-support-left-indefinite",
    values: {
      productAMigrationStatus: "migrated-verified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "migrated-verified",
      productDMigrationStatus: "migrated-verified",
      productsMigratedVerifiedCount: 4,
      productsMigratedUnverifiedCount: 0,
      deprecatedApiTrafficPercent: 0,
      replacementApiErrorRate: 0.1,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "indefinite-debt",
      rollbackReadinessStatus: "prepared",
      overallMigrationStatus: "complete-with-gaps",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 620_000,
    },
    componentHealth: lingeringDebtHealth,
  },

  // Independent trap: the Compatibility Layer is left active WITHOUT
  // Product C ever actually being migrated through it — i.e. activated
  // once (perhaps experimentally, or left on from an earlier attempt)
  // but never followed through with Product C's own migration action,
  // for long enough that this reads as abandoned governance rather than
  // active bridging work. Deliberately NOT gated on "every product
  // migrated-verified" (that combination is the scenario's correct,
  // legitimate permanent-bridge state for Product C — the Compatibility
  // Layer stays active forever for exactly the one product it was
  // built to carry, which is never itself a violation; see the module
  // doc comment's resolution of this exact design question). This rule
  // instead targets the real neglect case: the layer is on, nothing is
  // actually using it, and a long time has passed.
  {
    id: "compatibility-layer-active-unused-indefinite",
    when: {
      triggerEquals: {
        deadlineAnnounced: true,
        compatibilityLayerLingerWindowElapsed: true,
      },
      controlEquals: {
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
        [PRODUCT_C_MIGRATION_KEY]: "not-migrated",
      },
    },
    incidentState: "compatibility-layer-active-unused-indefinite",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 0.2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "breached",
      deadlineRiskSeverity: "critical",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "deadline-breached",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 540_000,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: lingeringDebtHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // OPTIMAL FAMILY — all four products independently migrated AND
  // verified, Product C's real blocker cleared via an active
  // Compatibility Layer, traffic fully drained, deprecated path blocked,
  // rollback prepared — AND every recovery-lag window genuinely elapsed.
  // Deliberately does NOT constrain migrationCohortOrder or
  // dualSupportMode at all (see the module doc comment's default-value
  // completeness explanation) — both Alternate Strong Paths A and B
  // reach this exact rule.
  // ══════════════════════════════════════════════════════════════════
  //
  // migrationGovernanceStatus is a real, candidate-visible DERIVED
  // field driven by migrationCohortOrder — since a single authored
  // rule's `values` is a fixed snapshot (it cannot itself branch on a
  // control's value), this is modeled as TWO concrete rules sharing the
  // identical `when` on every other control (so neither constrains
  // migrationCohortOrder in the sense of gating reachability) but
  // narrowed by migrationCohortOrder's OWN two possible families —
  // "unordered" (its untouched default) on one side, and either
  // deliberate ordering choice on the other. Both rules reach the exact
  // same incidentState/overallMigrationStatus/productsMigratedVerifiedCount
  // — governance is read honestly without ever gating OPTIMAL
  // reachability on it.
  {
    id: "fully-migrated-verified-optimal-governed",
    when: {
      triggerEquals: {
        deadlineAnnounced: true,
        verificationWindowElapsed: true,
        compatibilityConvergenceWindowElapsed: true,
        trafficDrainWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_A_MIGRATION_KEY]: "migrate",
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
        [REPLACEMENT_TRAFFIC_PERCENT_KEY]: 100,
        [DEPRECATED_API_TRAFFIC_BLOCK_KEY]: "blocked",
        [ROLLBACK_READINESS_KEY]: "prepared",
        [MIGRATION_COHORT_ORDER_KEY]: "prerequisite-first",
      },
    },
    incidentState: "fully-migrated-verified-optimal",
    values: {
      productAMigrationStatus: "migrated-verified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "migrated-verified",
      productDMigrationStatus: "migrated-verified",
      productsMigratedVerifiedCount: 4,
      productsMigratedUnverifiedCount: 0,
      deprecatedApiTrafficPercent: 0,
      replacementApiErrorRate: 0.1,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "governed",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "prepared",
      overallMigrationStatus: "complete-verified",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: healthyHealth,
  },
  {
    id: "fully-migrated-verified-optimal-governed-critical-first",
    when: {
      triggerEquals: {
        deadlineAnnounced: true,
        verificationWindowElapsed: true,
        compatibilityConvergenceWindowElapsed: true,
        trafficDrainWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_A_MIGRATION_KEY]: "migrate",
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
        [REPLACEMENT_TRAFFIC_PERCENT_KEY]: 100,
        [DEPRECATED_API_TRAFFIC_BLOCK_KEY]: "blocked",
        [ROLLBACK_READINESS_KEY]: "prepared",
        [MIGRATION_COHORT_ORDER_KEY]: "critical-first",
      },
    },
    incidentState: "fully-migrated-verified-optimal",
    values: {
      productAMigrationStatus: "migrated-verified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "migrated-verified",
      productDMigrationStatus: "migrated-verified",
      productsMigratedVerifiedCount: 4,
      productsMigratedUnverifiedCount: 0,
      deprecatedApiTrafficPercent: 0,
      replacementApiErrorRate: 0.1,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "governed",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "prepared",
      overallMigrationStatus: "complete-verified",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: healthyHealth,
  },
  // The default-value completeness anchor: migrationCohortOrder left at
  // its untouched default "unordered" (Alternate Strong Path B never
  // touches it). Identical `when` to the two rules above on every OTHER
  // control — this is what proves OPTIMAL reachability never depends on
  // migrationCohortOrder; only the candidate-visible
  // migrationGovernanceStatus differs, honestly.
  {
    id: "fully-migrated-verified-optimal-ungoverned",
    when: {
      triggerEquals: {
        deadlineAnnounced: true,
        verificationWindowElapsed: true,
        compatibilityConvergenceWindowElapsed: true,
        trafficDrainWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_A_MIGRATION_KEY]: "migrate",
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
        [REPLACEMENT_TRAFFIC_PERCENT_KEY]: 100,
        [DEPRECATED_API_TRAFFIC_BLOCK_KEY]: "blocked",
        [ROLLBACK_READINESS_KEY]: "prepared",
        [MIGRATION_COHORT_ORDER_KEY]: "unordered",
      },
    },
    incidentState: "fully-migrated-verified-optimal",
    values: {
      productAMigrationStatus: "migrated-verified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "migrated-verified",
      productDMigrationStatus: "migrated-verified",
      productsMigratedVerifiedCount: 4,
      productsMigratedUnverifiedCount: 0,
      deprecatedApiTrafficPercent: 0,
      replacementApiErrorRate: 0.1,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "prepared",
      overallMigrationStatus: "complete-verified",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // ACCEPTABLE FAMILY — genuine partial progress, no live violation:
  // some products migrated-and-verified, the deadline has not yet been
  // breached, and neither unverified-completion nor forced-cutover-
  // while-incompatible has ever been triggered. A real, operationally
  // defensible mid-migration handback — not merely "nothing bad has
  // happened yet."
  // ══════════════════════════════════════════════════════════════════

  // 3-of-4 verified: B, C (via active Compatibility Layer), and D all
  // migrated-and-verified; Product A's initial unverified claim is still
  // outstanding (a real, honestly-tracked completeness gap, not a live
  // violation — it is simply not yet re-verified).
  {
    id: "staged-b-c-d-verified-a-unverified",
    when: {
      triggerEquals: {
        deadlineAnnounced: true,
        t7dElapsed: true,
        verificationWindowElapsed: true,
        compatibilityConvergenceWindowElapsed: true,
      },
      controlEquals: {
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [COMPATIBILITY_LAYER_MODE_KEY]: "active",
        [DEADLINE_ESCALATION_MODE_KEY]: "normal",
      },
    },
    incidentState: "staged-b-c-d-verified-a-unverified",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "migrated-verified",
      productDMigrationStatus: "migrated-verified",
      productsMigratedVerifiedCount: 3,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 20,
      replacementApiErrorRate: 1.5,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "elevated",
      deadlineRiskSeverity: "warning",
      migrationGovernanceStatus: "governed",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: partialProgressHealth,
  },

  // 2-of-4 verified: B and D migrated-and-verified; C still genuinely
  // blocked (Compatibility Layer not yet activated); A's initial
  // unverified claim still outstanding. Real, bounded progress, no live
  // violation.
  {
    id: "staged-b-d-verified-a-unverified-c-blocked",
    when: {
      triggerEquals: { deadlineAnnounced: true, t7dElapsed: true, verificationWindowElapsed: true },
      controlEquals: {
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [PRODUCT_D_MIGRATION_KEY]: "migrate",
        [PRODUCT_C_MIGRATION_KEY]: "not-migrated",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [DEADLINE_ESCALATION_MODE_KEY]: "normal",
      },
    },
    incidentState: "staged-b-d-verified-a-unverified-c-blocked",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "migrated-verified",
      productsMigratedVerifiedCount: 2,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 40,
      replacementApiErrorRate: 2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "elevated",
      deadlineRiskSeverity: "warning",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },

  // Alternate Strong Path B mid-flight, dual-support genuinely engaged:
  // at least one product has already reached migrated-verified via a
  // targeted, temporary dual-write bridge, while the remaining products
  // are still mid-migration. dualSupportStatus honestly reads "enabled"
  // here (rather than this scenario's other ACCEPTABLE-family rules'
  // "disabled", which are reached via Strategy A, never touching this
  // lever) — this is what proves dualSupportMode is read live rather
  // than hardcoded, and is itself a real, candidate-visible state, not
  // merely a scoring-only afterthought.
  {
    id: "staged-with-dual-support-active",
    when: {
      triggerEquals: { deadlineAnnounced: true, t7dElapsed: true, verificationWindowElapsed: true },
      controlEquals: {
        [PRODUCT_B_MIGRATION_KEY]: "migrate",
        [MIGRATION_VERIFICATION_MODE_KEY]: "verify-before-complete",
        [DUAL_SUPPORT_MODE_KEY]: "enabled",
        [PRODUCT_C_MIGRATION_KEY]: "not-migrated",
      },
    },
    incidentState: "staged-with-dual-support-active",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "migrated-verified",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 1,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 55,
      replacementApiErrorRate: 3,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "elevated",
      deadlineRiskSeverity: "warning",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "enabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },

  // Just-engaged tick-zero proof: the Compatibility Layer has just been
  // activated (unblocking Product C) but no convergence time has
  // elapsed yet — proves the compatibility-convergence window is not
  // instant. No product has reached migrated-verified yet.
  {
    id: "compatibility-layer-just-activated",
    when: {
      triggerEquals: { deadlineAnnounced: true, compatibilityConvergenceWindowElapsed: false },
      controlEquals: { [COMPATIBILITY_LAYER_MODE_KEY]: "active", [PRODUCT_C_MIGRATION_KEY]: "migrate" },
    },
    incidentState: "compatibility-layer-just-activated",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "migrated-unverified",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 2,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 8,
      compatibilityExceptionsCount: 35,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: partialProgressHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE PROGRESSION — no meaningful candidate action at all. The
  // deadline phases advance on their own regardless of any control;
  // deadlineRiskStatus escalates purely from elapsed time, while every
  // live traffic metric keeps reading healthy right up until the
  // external deadline actually hits. The "green dashboard hides the
  // approaching deadline" trap's clearest form.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "wait-too-long-deadline-breach",
    when: { triggerEquals: { deadlineReached: true } },
    incidentState: "wait-too-long-deadline-breach",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 95,
      compatibilityExceptionsCount: 480,
      deadlineRiskStatus: "breached",
      deadlineRiskSeverity: "critical",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "deadline-breached",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: deadlineBreachedHealth,
  },
  {
    id: "baseline-t48h-critical-risk",
    when: { triggerEquals: { t48hElapsed: true } },
    incidentState: "baseline-t48h-critical-risk",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 0.2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "critical",
      deadlineRiskSeverity: "critical",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },
  {
    id: "baseline-t7d-elevated-risk",
    when: { triggerEquals: { t7dElapsed: true } },
    incidentState: "baseline-t7d-elevated-risk",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 0.2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "elevated",
      deadlineRiskSeverity: "warning",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },
  {
    id: "baseline-t14d-low-risk",
    when: { triggerEquals: { t14dElapsed: true } },
    incidentState: "baseline-t14d-low-risk",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 0.2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },

  // ── Default/fallback: incident announced, no other trigger/control
  // combination above has matched yet (covers T30D itself and any other
  // candidate control permutation not explicitly enumerated above while
  // the deadline has only just been announced).
  {
    id: "deadline-announced-baseline",
    when: { triggerEquals: { deadlineAnnounced: true } },
    incidentState: "deadline-announced-baseline",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 0.2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },

  // ── Default/fallback: before the incident begins (deadline not yet
  // announced at all).
  {
    id: "pre-incident",
    when: {},
    incidentState: "pre-incident",
    values: {
      productAMigrationStatus: "migrated-unverified",
      productBMigrationStatus: "not-migrated",
      productCMigrationStatus: "blocked-incompatible",
      productDMigrationStatus: "not-migrated",
      productsMigratedVerifiedCount: 0,
      productsMigratedUnverifiedCount: 1,
      deprecatedApiTrafficPercent: 70,
      replacementApiErrorRate: 0.2,
      compatibilityExceptionsCount: 0,
      deadlineRiskStatus: "low",
      deadlineRiskSeverity: "normal",
      migrationGovernanceStatus: "ungoverned",
      dualSupportStatus: "disabled",
      rollbackReadinessStatus: "not-prepared",
      overallMigrationStatus: "in-progress",
      missedVerificationCount: 1,
      failedForcedCutoverCount: 0,
      compatibilityLayerDebtAccumulatedMs: 0,
      dualSupportDebtAccumulatedMs: 0,
    },
    componentHealth: productCBlockedHealth,
  },
];
