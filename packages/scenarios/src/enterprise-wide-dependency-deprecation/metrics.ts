import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Per-product migration status (derived, candidate-visible) ───────
  // "not-migrated" / "migrated-unverified" / "migrated-verified" /
  // "blocked-incompatible". Product A starts already flipped to
  // "migrate" at the control level but with NO verification ever run —
  // the flagship's required "looks complete but correctness was never
  // checked" trap seed, visible from tick zero. Product B is partially
  // migrated (real, visible partial progress, not yet complete).
  // Product C is blocked on a genuine compatibility issue — flipping its
  // control alone does nothing until the Compatibility Layer is active.
  // Product D is fully untouched.
  productAMigrationStatus: "migrated-unverified",
  productBMigrationStatus: "not-migrated",
  productCMigrationStatus: "blocked-incompatible",
  productDMigrationStatus: "not-migrated",

  // ── Fleet-wide aggregate (the PRIMARY candidate-visible rollup; also
  // what the flagship's single-dimension terminal gate reads) ─────────
  // Count of products currently in "migrated-verified" status. 0-4.
  productsMigratedVerifiedCount: 0,
  // Count of products currently in "migrated-unverified" status — i.e.
  // claimed done, never checked. Non-zero here is a real, live, visible
  // warning signal distinct from the verified count.
  productsMigratedUnverifiedCount: 1,

  // ── Live traffic-facing health (the DECOY signal) ────────────────────
  // Every one of these can read fully healthy while the real governance
  // problem (unverified/blocked/unmigrated products against a hard
  // deadline) compounds untouched — the batch's "green dashboard hides
  // the real problem" pattern, carried into a deadline-driven governance
  // axis.
  deprecatedApiTrafficPercent: 70,
  replacementApiErrorRate: 0.2,
  compatibilityExceptionsCount: 0,

  // ── Deadline risk (candidate-visible, THE central judgment signal) ──
  // "low" / "elevated" / "critical" / "breached". Elevated/critical
  // apply whenever any product remains short of migrated-and-verified as
  // the deadline phases advance — regardless of how healthy live traffic
  // reads. "breached" applies once the hard deadline has actually passed
  // with a product still dependent on the deprecated path.
  deadlineRiskStatus: "low",
  // Severity-field-shaped mirror of deadlineRiskStatus above, mapped onto
  // the engine's required {normal, warning, critical} vocabulary (see
  // definition.ts's severityFields) — "low"->normal, "elevated"->warning,
  // "critical"/"breached"->critical. This is what drives reliability's
  // criticalTimeRatio measure in scoring.ts.
  deadlineRiskSeverity: "normal",

  // ── Governance signal (derived from migrationCohortOrder; never gates
  // success/acceptable — see rules.ts's doc comment on why cohort order
  // must stay scoring-only to avoid the default-value completeness
  // trap) ───────────────────────────────────────────────────────────────
  migrationGovernanceStatus: "ungoverned",

  // ── Dual-support posture (derived from dualSupportMode; also
  // scoring-only, never a terminal gate) ───────────────────────────────
  dualSupportStatus: "disabled",

  // ── Rollback readiness (candidate-visible, independent risk axis) ───
  rollbackReadinessStatus: "not-prepared",

  // ── Overall summary status (string-state field read directly by
  // success/acceptable conditions) ─────────────────────────────────────
  // "in-progress" / "complete-verified" / "complete-with-gaps" /
  // "forced-cutover-failure" / "deadline-breached".
  overallMigrationStatus: "in-progress",

  // ── Historical / non-resetting consequence counters (binding
  // requirement: at least 2 independently tracked) ────────────────────
  // Cumulative count of products ever marked "migrate" while
  // migrationVerificationMode was "skip-verification" — a real,
  // permanent record that correctness was never actually checked for
  // that product at the moment it was declared done, even if the
  // candidate later turns verification on for everyone else.
  missedVerificationCount: 1,
  // Cumulative count of forced-cutover actions taken while at least one
  // critical product was still incompatible with the Replacement API —
  // each one is a real, permanent failure event on this attempt's
  // record, even after the candidate backs off deadlineEscalationMode.
  failedForcedCutoverCount: 0,
  // Cumulative milliseconds the Compatibility Layer has been left
  // "active" after it was no longer needed by any still-migrating
  // product (i.e. after every product has reached migrated-verified) —
  // the business invariant "a shared compatibility layer must not
  // become a permanent single point of failure" made measurable.
  compatibilityLayerDebtAccumulatedMs: 0,
  // Cumulative milliseconds dualSupportMode has been left "enabled"
  // after every product has reached migrated-verified — the business
  // invariant "dual-support may be temporary but cannot become
  // indefinite hidden debt" made measurable.
  dualSupportDebtAccumulatedMs: 0,
};
