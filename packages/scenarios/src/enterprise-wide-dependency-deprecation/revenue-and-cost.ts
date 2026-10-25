import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { COMPATIBILITY_LAYER_MODE_KEY, DUAL_SUPPORT_MODE_KEY, REPLACEMENT_TRAFFIC_PERCENT_KEY } from "./controls";

/**
 * Revenue loss here models DEADLINE/GOVERNANCE BUSINESS RISK, not classic
 * downtime from a request-handling failure — every "in-progress"/
 * "staged-*" state's live traffic metrics stay close to healthy. The
 * real money is lost from (a) deadline risk compounding the longer any
 * product remains unmigrated-and-unverified against a hard external
 * deadline, and (b) the two outright failure traps — a forced cutover
 * against an incompatible product, and the deadline genuinely being
 * breached — which lose money fast and heavily, modeling the real
 * business cost of an enterprise dependency actually going dark for one
 * or more products.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  "pre-incident": 0,
  "deadline-announced-baseline": 5,
  "baseline-t14d-low-risk": 8,
  "baseline-t7d-elevated-risk": 35,
  "baseline-t48h-critical-risk": 90,
  "wait-too-long-deadline-breach": 420,
  "forced-cutover-with-incompatible-product": 380,
  "mark-all-migrated-no-verification-compat-inactive": 140,
  "mark-all-migrated-no-verification-compat-active": 60,
  "dual-support-left-indefinite": 15,
  "compatibility-layer-active-unused-indefinite": 300,
  "staged-with-dual-support-active": 20,
  "compatibility-layer-just-activated": 25,
  "staged-b-d-verified-a-unverified-c-blocked": 18,
  "staged-b-c-d-verified-a-unverified": 10,
  "fully-migrated-verified-optimal": 0,
};

/**
 * Infrastructure cost is a real, secondary signal here: running the
 * Compatibility Layer and/or dual-support mode both cost real,
 * continuous infrastructure spend (two parallel write/translation paths
 * instead of one), and a 100% replacement-traffic shift costs nothing
 * extra on its own (it is the eventual steady state, not an added
 * resource). This correctly makes costEfficiency discriminate between a
 * candidate who leaves either bridging lever on longer than necessary
 * and one who winds them down promptly once no longer needed.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 3_200,
  perUnitMonthlyUsd: {
    [`${COMPATIBILITY_LAYER_MODE_KEY}:active`]: 180,
    [`${DUAL_SUPPORT_MODE_KEY}:enabled`]: 260,
    [`${REPLACEMENT_TRAFFIC_PERCENT_KEY}:100`]: 0,
  },
};

/**
 * OPTIMAL: every product independently migrated AND verified
 * (overallMigrationStatus === "complete-verified"), deprecated traffic
 * fully drained, no live deadline risk. Reachable via EITHER Alternate
 * Strong Path A or B — the underlying rule's `when` never constrains
 * migrationCohortOrder/dualSupportMode (see rules.ts's module doc
 * comment).
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "overallMigrationStatus", operator: "equals", comparedTo: "complete-verified" },
    { key: "productsMigratedVerifiedCount", operator: "equals", comparedTo: 4 },
    { key: "deadlineRiskStatus", operator: "equals", comparedTo: "low" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — real, substantial,
 * genuinely verified migration progress (at least 3 of 4 products
 * migrated-and-verified, including Product C's real compatibility
 * blocker genuinely cleared whenever it is one of the three), with no
 * live violation (no forced-cutover-while-incompatible, no fleet-wide
 * unverified "complete" claim) and deadline risk not yet breached. This
 * is a real, operationally defensible mid-migration handback: the
 * highest-risk work is done and verified, even though the full fleet
 * has not finished.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [
    { key: "productsMigratedVerifiedCount", operator: "greater_than_or_equal", comparedTo: 3 },
    { key: "overallMigrationStatus", operator: "equals", comparedTo: "in-progress" },
  ],
  sustainedSeconds: 30,
};

/**
 * FAILURE: the deadline has genuinely been breached with at least one
 * product still dependent on the now-retired deprecated path, OR a
 * forced cutover was executed against a still-incompatible product —
 * either is a catastrophic, within-attempt business failure, not merely
 * "still in progress." Gated on the counted, cumulative
 * failedForcedCutoverCount (a real counted event) so a brief accidental
 * flip is not instantly fatal but a sustained forced-cutover failure (or
 * a sustained deadline breach) is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "deadlineRiskStatus", operator: "equals", comparedTo: "breached" }],
  sustainedSeconds: 45,
};
