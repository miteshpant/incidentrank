import type {
  FailureCondition,
  InfrastructureCostConfig,
  RevenueLossRatePerMinute,
  SuccessCondition,
} from "@incidentrank/simulator";
import { CERTIFICATE_OVERLAP_WINDOW_KEY, LEGACY_COMPATIBILITY_BRIDGE_KEY } from "./controls";

// NOTE on acceptableCondition: StateCondition.key reads from
// state.values (or state.triggers with source:"trigger") — never from
// a raw control value directly (see packages/simulator/src/types.ts's
// StateCondition). The ACCEPTABLE tier's "overlap window genuinely
// open, nothing currently rejecting" distinction is therefore expressed
// entirely through fleetConnectionStatus's authored value (rules.ts
// only ever sets fleetConnectionStatus:"nominal" in states where the
// safe overlap mechanism is genuinely engaged — every unsafe/trap state
// authors a non-"nominal" value instead), rather than by re-deriving a
// separate state echo of the control. This keeps the same
// value-not-control discipline every sibling scenario's conditions use.

/**
 * Revenue loss here models real connection-rejection business impact —
 * either a deterministic expiry outage (calendar time ran out on an
 * un-rotated cohort) or a self-inflicted premature-revocation gap
 * (certificate withdrawn before a cohort's new chain was genuinely
 * verified). Every safe/recovering state loses nothing; every unsafe
 * state — including the validation-bypass trap, which looks like an
 * instant availability fix — is sized by how many connections are
 * actually being rejected (or, for the bypass, how badly the security
 * posture has degraded) in that state.
 */
export const revenueLossRatePerMinute: RevenueLossRatePerMinute = {
  healthy: 0,
  "bypass-active": 60,
  "bypass-sustained": 160,
  "fully-rotated-safe": 0,
  "premature-gap": 220,
  "premature-gap-sustained": 420,
  "gap-recovered": 0,
  "gap-recovering-window1": 45,
  "gap-just-rolled-back": 90,
  "false-claim-overlap-never-opened": 15,
  "expiry-deadline-missed": 260,
  "expiry-deadline-missed-sustained": 480,
  "expiry-deadline-missed-partial": 200,
  "expiry-deadline-missed-partial-sustained": 380,
  "expiry-deadline-missed-critical-rotated": 160,
  "expiry-deadline-missed-critical-rotated-sustained": 340,
  "expiry-deadline-missed-legacy-bridged": 100,
  "expiry-deadline-missed-legacy-bridged-sustained": 260,
  "expiry-deadline-missed-false-claim-all-cohorts": 260,
  "expiry-deadline-missed-false-claim-all-cohorts-sustained": 480,
  "all-cohorts-rotated-overlap": 0,
  "legacy-bridged-progress": 5,
  "critical-rotated-progress": 10,
  "modern-rotated-progress": 10,
  "overlap-opened-no-progress": 15,
  "false-bridge-legacy-not-engaged": 20,
  "deadline-risk-unaddressed": 15,
};

/**
 * Infrastructure cost is a minor, secondary signal — real but modest:
 * running the fleet-wide certificate-overlap window (both old and new
 * certificates trusted simultaneously) and Legacy's extended
 * compatibility bridge both carry a genuine, if small, ongoing
 * validation/compute overhead compared to a hard cutover.
 */
export const infrastructureCost: InfrastructureCostConfig = {
  baselineMonthlyUsd: 2_200,
  perUnitMonthlyUsd: {
    [`${CERTIFICATE_OVERLAP_WINDOW_KEY}:open`]: 40,
    [`${LEGACY_COMPATIBILITY_BRIDGE_KEY}:on`]: 65,
  },
};

/**
 * OPTIMAL: every cohort genuinely verified-rotated, old certificate
 * revoked (fleet cleanup complete), Legacy's trust bundle verified, no
 * live connection-rejecting condition. Reachable via either alternate
 * strong path (modern-first or critical-first ordering) once rollout
 * genuinely completes in the correct sequence.
 */
export const successCondition: SuccessCondition = {
  conditions: [
    { key: "fleetConnectionStatus", operator: "equals", comparedTo: "nominal" },
    { key: "modernCohortRotationStatus", operator: "equals", comparedTo: "verified-rotated" },
    { key: "criticalCohortRotationStatus", operator: "equals", comparedTo: "verified-rotated" },
    { key: "legacyCohortRotationStatus", operator: "equals", comparedTo: "verified-rotated" },
  ],
  sustainedSeconds: 30,
};

/**
 * ACCEPTABLE: the legitimate degraded-but-safe tier — no cohort is
 * currently experiencing a live connection-rejecting condition
 * (fleetConnectionStatus is "nominal"), the old certificate has not
 * been revoked, and the fleet-wide overlap window is genuinely open —
 * even if not every cohort has finished rotating yet. This is a real,
 * operationally defensible handback: nothing is currently broken and
 * the safe overlap mechanism is correctly engaged, even though the full
 * fleet has not yet completed its staged rotation.
 */
export const acceptableCondition: SuccessCondition = {
  conditions: [{ key: "fleetConnectionStatus", operator: "equals", comparedTo: "nominal" }],
  sustainedSeconds: 30,
};

/**
 * FAILURE: cumulative rejected-connection exposure has run long enough,
 * at a severe enough volume, to constitute a catastrophic, unrecoverable
 * outage within this attempt — not merely "still mid-rotation." Gated on
 * the cumulative count (a real, counted number of actually-rejected
 * connections), so a brief flip is not instantly fatal but a sustained
 * unaddressed deadline miss or sequencing gap is.
 */
export const failureCondition: FailureCondition = {
  conditions: [{ key: "cumulativeRejectedConnectionCount", operator: "greater_than_or_equal", comparedTo: 1_200 }],
  sustainedSeconds: 30,
};
