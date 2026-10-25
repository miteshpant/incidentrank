import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { actionClassifications } from "./action-classifications";
import { architecture, healthyComponentHealth } from "./architecture";
import { controls } from "./controls";
import { initialValues } from "./metrics";
import { enterpriseWideDependencyDeprecationRules } from "./rules";
import {
  acceptableCondition,
  failureCondition,
  infrastructureCost,
  revenueLossRatePerMinute,
  successCondition,
} from "./revenue-and-cost";
import { timedEvents } from "./timed-events";

export {
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

const TICK_MS = 1_000;

export const enterpriseWideDependencyDeprecationSimulation: ScenarioSimulationDefinition = {
  tickMs: TICK_MS,
  architecture,
  controls,
  initialValues,
  initialComponentHealth: healthyComponentHealth,
  severityFields: [
    {
      // Deadline-risk severity, deliberately independent of every
      // product/Shared-SDK/Compatibility-Layer componentHealth value —
      // this is what drives reliability's criticalTimeRatio measure in
      // scoring.ts: time spent with DEADLINE risk genuinely elevated/
      // critical/breached, never time spent with live traffic degraded.
      // "elevated"/"critical" map to this field's "warning"/"critical"
      // vocabulary (see rules.ts's deadlineRiskStatus values) — the
      // engine's SeverityFieldConfig enforces exactly {normal, warning,
      // critical} on any field it tracks, so this scenario maps its own
      // four-value deadlineRiskStatus vocabulary ("low"/"elevated"/
      // "critical"/"breached") onto a SEPARATE normal/warning/critical
      // severity field (deadlineRiskSeverity) rather than overloading
      // deadlineRiskStatus itself — see metrics.ts/rules.ts for both
      // fields tracked in parallel.
      key: "deadlineRiskSeverity",
      announceCritical: {
        enteringType: "SEVERITY_CRITICAL",
        enteringMessage: "CANDIDATE-ACTION CONSEQUENCE: deadline risk has entered a critical state — at least one product remains unmigrated-and-unverified as the hard deadline closes in.",
        recoveringType: "SEVERITY_RECOVERED",
        recoveringMessage: "CANDIDATE-ACTION CONSEQUENCE: deadline risk has recovered from critical.",
      },
    },
  ],
  numericWatchFields: [
    {
      // HISTORICAL/PERMANENT consequence #1 (binding requirement: at
      // least 2 independently tracked). trackPeak:true is what makes
      // this genuinely non-resetting: state.peaks.peakValues computes
      // Math.max(previousPeak, currentValue) every tick regardless of
      // which rule currently matches (tick.ts), so even once a
      // candidate turns migrationVerificationMode to
      // "verify-before-complete" for every remaining product, the
      // fact that at least one product was EVER marked migrated while
      // verification was skipped stays recorded as this attempt's true
      // peak for the rest of the attempt.
      key: "missedVerificationCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "HISTORICAL CONSEQUENCE: at least one product has been marked migrated without its compatibility/correctness checks ever having run — a permanent gap in this attempt's record.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further products are currently being marked migrated without verification.",
      },
    },
    {
      // HISTORICAL/PERMANENT consequence #2: a counted, cumulative
      // record of forced-cutover failures, independent of
      // missedVerificationCount above — proving the trap is reachable
      // and permanently recorded through a completely different control
      // (deadlineEscalationMode) than the verification trap.
      key: "failedForcedCutoverCount",
      trackPeak: true,
      threshold: {
        value: 1,
        enteringType: "THRESHOLD_CROSSED",
        enteringMessage: "HISTORICAL CONSEQUENCE: a forced cutover was executed while at least one product remained incompatible with the Replacement API — a permanent failure event on this attempt's record.",
        recoveringType: "THRESHOLD_RECOVERED",
        recoveringMessage: "No further forced cutovers are currently being executed against an incompatible product.",
      },
    },
    {
      // HISTORICAL/PERMANENT consequence #3: the business invariant
      // "a shared compatibility layer must not become a permanent
      // single point of failure" made measurable — independently
      // tracked so it can never hide behind either counter above.
      key: "compatibilityLayerDebtAccumulatedMs",
      trackPeak: true,
    },
    {
      // HISTORICAL/PERMANENT consequence #4: the business invariant
      // "dual-support may be temporary but cannot become indefinite
      // hidden debt" made measurable — independently tracked from the
      // Compatibility Layer's own debt counter above.
      key: "dualSupportDebtAccumulatedMs",
      trackPeak: true,
    },
    {
      key: "deprecatedApiTrafficPercent",
      trackPeak: false,
    },
    {
      key: "productsMigratedVerifiedCount",
      trackPeak: false,
    },
  ],
  timedEvents,
  rules: enterpriseWideDependencyDeprecationRules,
  revenueLossRatePerMinute,
  infrastructureCost,
  successCondition,
  failureCondition,
  actionClassifications,
  // ── Completion-mode audit (same style/rigor as the Phase 6E
  // siblings, and the flagship's own extra-rigor requirement) ─────────
  //
  // Reachable terminal/stable rule states, classified by their real
  // authored values (productsMigratedVerifiedCount /
  // overallMigrationStatus / deadlineRiskStatus):
  //
  //   pre-incident                                      N/A (pre-incident)
  //   deadline-announced-baseline                        UNSAFE   0/in-progress/low
  //   baseline-t14d-low-risk                             UNSAFE   0/in-progress/low
  //   baseline-t7d-elevated-risk                         UNSAFE   0/in-progress/elevated
  //   baseline-t48h-critical-risk                        UNSAFE   0/in-progress/critical
  //   wait-too-long-deadline-breach                      UNSAFE   0/deadline-breached/breached
  //   forced-cutover-with-incompatible-product           UNSAFE   0/forced-cutover-failure/critical
  //   mark-all-migrated-no-verification-compat-inactive  UNSAFE   0/complete-with-gaps/critical
  //   mark-all-migrated-no-verification-compat-active    UNSAFE   0/complete-with-gaps/critical
  //   compatibility-layer-active-unused-indefinite        UNSAFE   0/deadline-breached/breached
  //   staged-with-dual-support-active                     ACCEPTABLE-ineligible* 1/in-progress/elevated
  //   compatibility-layer-just-activated                  ACCEPTABLE-ineligible* 0/in-progress/low
  //   staged-b-d-verified-a-unverified-c-blocked          ACCEPTABLE-ineligible* 2/in-progress/elevated
  //   staged-b-c-d-verified-a-unverified                  ACCEPTABLE            3/in-progress/elevated
  //   dual-support-left-indefinite                        UNSAFE   4/complete-with-gaps/low
  //   fully-migrated-verified-optimal                     OPTIMAL  4/complete-verified/low
  //
  // * "ACCEPTABLE-ineligible" rows have productsMigratedVerifiedCount <
  //   3 — they fail acceptableCondition's explicit >= 3 gate, which is
  //   deliberate: this scenario's acceptable bar requires the large
  //   majority of the fleet (3 of 4 products) to be GENUINELY VERIFIED,
  //   not merely "some real progress happened." A candidate who stops
  //   here must keep going or accept an unresolved/declared_unstable
  //   outcome — this is the Principal-level bar being set deliberately
  //   high, consistent with the flagship's "no single
  //   control/product resolves this" requirement extending to the
  //   acceptable tier too.
  //
  // ── Why every UNSAFE row fails BOTH successCondition and
  // acceptableCondition ────────────────────────────────────────────────
  // Every UNSAFE state above fails for a real, named reason:
  // overallMigrationStatus reads "complete-with-gaps" (a live or
  // historical unverified-completion claim),
  // "forced-cutover-failure" (the deadline-panic trap), or
  // "deadline-breached" (the wait-too-long trap and the compatibility-
  // layer-neglect trap) — successCondition's explicit
  // overallMigrationStatus === "complete-verified" check and
  // acceptableCondition's explicit overallMigrationStatus !==
  // "forced-cutover-failure" + deadlineRiskStatus !== "breached" checks
  // both fail these states directly, regardless of how many products'
  // individual migration controls happen to read "migrate". Notably,
  // dual-support-left-indefinite has productsMigratedVerifiedCount===4
  // (every product genuinely migrated and verified!) yet still fails
  // BOTH conditions purely on overallMigrationStatus — proving that
  // leaving a temporary bridge lever on indefinitely is treated as
  // seriously as never having verified anything at all, exactly per the
  // business invariant that dual-support cannot become indefinite
  // hidden debt.
  //
  // ── Why ACCEPTABLE (not merely "making progress") is the correct
  // tier for staged-b-c-d-verified-a-unverified specifically ──────────
  // This state has productsMigratedVerifiedCount===3 — the large
  // majority of the fleet is both migrated AND independently verified,
  // including Product C's real compatibility blocker genuinely cleared
  // — with no live violation (overallMigrationStatus stays
  // "in-progress", not "complete-with-gaps"/"forced-cutover-failure"/
  // "deadline-breached") and deadlineRiskStatus not yet "breached".
  // This is the scenario's required legitimate degraded-but-safe tier:
  // a real, operationally defensible mid-migration handback, distinct
  // from every UNSAFE row above and from the full OPTIMAL below.
  //
  // ── Flagship acceptance test: "migrate everything then Finish
  // immediately" ───────────────────────────────────────────────────────
  // Setting all four productX controls to "migrate" while leaving
  // migrationVerificationMode at its untouched default
  // "skip-verification" and compatibilityLayerMode at its untouched
  // default "inactive" matches
  // mark-all-migrated-no-verification-compat-inactive:
  // productsMigratedVerifiedCount stays 0, overallMigrationStatus reads
  // "complete-with-gaps" — this satisfies NEITHER successCondition
  // (requires "complete-verified") NOR acceptableCondition (requires
  // productsMigratedVerifiedCount >= 3, which is 0 here). This scenario's
  // test suite proves this explicitly: "migrate everything then Finish"
  // never reaches OPTIMAL or ACCEPTABLE, confirming the flagship's
  // binding "no single action resolves this" requirement.
  //
  // ── Historical damage survives reaching OPTIMAL ─────────────────────
  // fully-migrated-verified-optimal's live missedVerificationCount/
  // failedForcedCutoverCount both author 0 (these live fields answer
  // "is this happening RIGHT NOW"), but state.peaks.peakValues (trackPeak:
  // true, computed generically by the engine as Math.max every tick)
  // for missedVerificationCount/failedForcedCutoverCount/
  // compatibilityLayerDebtAccumulatedMs/dualSupportDebtAccumulatedMs
  // remain permanently at this attempt's true worst point for the rest
  // of the attempt if the candidate ever passed through any of the four
  // traps that set them nonzero first — never reset by later reaching
  // the clean optimal state, proven explicitly by this scenario's
  // non-resetting-peak tests.
  //
  // ── Candidate-declared, not automatic ───────────────────────────────
  // The bar between "3 of 4 verified, genuinely safe to hand back"
  // (ACCEPTABLE) and "all 4 verified, fully drained" (OPTIMAL) is a real
  // system-state distinction, but deciding WHETHER handing back at the
  // 3-of-4 point is acceptable — as opposed to continuing to push the
  // last product through — is a genuine Principal-level governance
  // judgment call, not something the engine should auto-resolve the
  // instant a threshold is crossed. This mirrors every other Phase 6E
  // candidate_declared sibling's completion-mode reasoning exactly.
  //
  // ── Immediate-Finish audit ───────────────────────────────────────────
  // Triggering the incident and immediately calling Finish with zero
  // actions, before even PHASE_T30D_MS has elapsed: the matched rule is
  // pre-incident (overallMigrationStatus "in-progress",
  // productsMigratedVerifiedCount 0), which satisfies neither
  // successCondition nor acceptableCondition. Even after PHASE_T30D_MS
  // elapses with zero actions, deadline-announced-baseline matches with
  // the exact same failing values. evaluateCandidateDeclaredFinish
  // therefore returns outcome: "declared_unstable" in both cases — the
  // expected default, especially important here since every live
  // traffic metric already reads close to healthy at this exact moment
  // (this batch's binding no-outage/proactive-scenario concern).
  completion: { mode: "candidate_declared", acceptableCondition },
};
