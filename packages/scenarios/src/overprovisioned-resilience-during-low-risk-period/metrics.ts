import type { StateValue } from "@incidentrank/simulator";

export const initialValues: Record<string, StateValue> = {
  // ── Decoy-healthy signals — these never move while the mandatory
  // resilience floor is intact, REGARDLESS of how much cost has been
  // trimmed or how badly it has been trimmed. A candidate who only
  // watches these concludes "nothing is wrong," which is exactly the
  // green-dashboard trap this scenario is built around: nothing IS wrong
  // right now, in either the safe or the unsafe case, until the
  // periodic AZ-failure drill actually tests the floor.
  requestSuccessRate: 99.95,
  p99LatencyMs: 90,

  // ── Live cost signal ────────────────────────────────────────────────
  monthlyInfrastructureCostUsd: 48_000,

  // ── Mandatory resilience floor status — the single authoritative
  // summary of "is this configuration currently at/above the mandatory
  // floor the business invariants require." Read by scoring's
  // dataIntegrity-as-penalties measure and by successCondition/
  // acceptableCondition. Values:
  //   "at-floor-or-above" — multiAzMode has a real failover target AND
  //                          failoverReserve holds real reserve capacity
  //                          AND backupFrequency still bounds data loss
  //                          within policy. Safe, regardless of how
  //                          aggressively non-floor controls (replica
  //                          count, warm capacity, standby fleet,
  //                          database sizing, cache sizing) have been
  //                          trimmed.
  //   "below-floor"       — at least one mandatory-floor control has
  //                          been reduced past the floor. Genuinely
  //                          unsafe even though every live metric above
  //                          still reads healthy right now.
  resilienceFloorStatus: "at-floor-or-above",

  // ── HISTORICAL / CUMULATIVE consequence (non-resetting). Only ever
  // increases, and only when the mandatory floor was BELOW the floor at
  // the moment a periodic AZ-failure drill fires (timed-events.ts) —
  // never from merely being below the floor with no drill having fired
  // yet, and never decremented by restoring the floor afterward. Proven
  // non-resetting via state.peaks.peakValues (numericWatchFields,
  // trackPeak: true) in the test file.
  cumulativeUnabsorbedFailoverDrillCount: 0,

  // ── Review/judgment-state field — the single authoritative summary of
  // "what posture is this configuration" for candidate feedback and for
  // the acceptable/optimal tier distinction. Values:
  //   "unreviewed-peak-posture" — nothing has been reduced yet; every
  //                               control still sits at its expensive
  //                               peak-event value. Safe (the floor was
  //                               never touched) but wasteful — the
  //                               incident this scenario poses has not
  //                               been addressed at all.
  //   "reduced-below-floor"     — at least one mandatory-floor control
  //                               has been reduced past the floor.
  //                               Genuinely unsafe.
  //   "reduced-partial-safe"    — the floor is intact AND a real,
  //                               deliberate reduction has been made to
  //                               at least one non-floor cost control,
  //                               but NOT the full canonical strategy
  //                               (the mandatory-floor controls
  //                               themselves — multiAzMode/
  //                               failoverReserve — were left at their
  //                               most expensive setting rather than
  //                               moved down to the stated baseline too).
  //                               The genuine ACCEPTABLE tier: safe, and
  //                               a real if incomplete cost decision has
  //                               been made, never reachable with zero
  //                               action.
  //   "reduced-to-baseline-safe"— every mandatory-floor control sits at
  //                               or above the floor, AND the floor
  //                               controls themselves (multiAzMode/
  //                               failoverReserve) have genuinely been
  //                               moved down to the stated operating
  //                               baseline alongside other cost
  //                               reductions. The scenario's required
  //                               OPTIMAL, fully cost-efficient resolution.
  costPostureStatus: "unreviewed-peak-posture",
};
