import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Emergency Capacity Reservation Decision's scoring configuration.
 *
 * This is a PROACTIVE, pre-event decision scenario — nothing is broken
 * at incident start, and the real test only arrives once the event
 * itself begins (timed-events.ts's EVENT_ARRIVAL_MS/EVENT_SUSTAINED_MS).
 * Four real judgment axes drive every dimension below: whether
 * Critical-Tier workload actually has enough protected headroom
 * (dataIntegrity, the primary gate), whether the reservation is
 * genuinely distributed across regions rather than hiding a
 * concentration risk (also dataIntegrity, independently), whether the
 * decision was actually locked in before the deadline (reliability/
 * customerImpact, via the live severity/revenue fields), and whether
 * the resulting spend is proportionate rather than wasteful
 * (costEfficiency — a REAL, material discriminator per this scenario's
 * brief, never a token amount).
 *
 * costIncreaseRatio (peak vs. baselineMonthlyUsd) is used directly here,
 * unlike Data Retention Policy Misconfiguration's finalStringEquals
 * workaround — this scenario's baseline (600 USD/mo, revenue-and-
 * cost.ts) represents reserving NOTHING, and every reachable reservation
 * choice is a genuine ADD on top of it, so costIncreaseRatio honestly
 * discriminates between Path A's high reservation, Path B's moderate
 * reservation, and the required maximal-waste trap — no generic-engine
 * limitation to work around here.
 */
export const EMERGENCY_CAPACITY_RESERVATION_DECISION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // WIDE bands, deliberately: every genuinely safe path (Path A,
      // Path B, or a candidate who locks in early vs. right before the
      // deadline) reaches its sustained-stable state at essentially the
      // same elapsed time, since the event's own arrival schedule — not
      // decision speed — dominates recovery time here. The real
      // judgment this scenario tests is the DECISION'S QUALITY, not how
      // fast the dashboard turns green.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 260, points: 300 },
        { atMost: 320, points: 260 },
        { atMost: 400, points: 200 },
        { atMost: 500, points: 120 },
        { points: 40 },
      ],
    },
    {
      // Real, material revenue-loss model: every breached/at-risk state
      // above loses real money (revenue-and-cost.ts); every genuinely
      // protected state loses none.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 0, points: 200 },
        { atMost: 50, points: 160 },
        { atMost: 300, points: 90 },
        { atMost: 800, points: 40 },
        { points: 10 },
      ],
    },
    {
      // PRIMARY gate: Critical-Tier headroom AND regional distribution,
      // penalized independently so they stack — the concentration
      // trap, once disrupted, violates BOTH at once and loses the large
      // majority of this dimension's 200 points.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "criticalWorkloadProtectionStatus", value: "breached" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "criticalWorkloadProtectionStatus", value: "at-risk" },
          atLeast: 1,
          subtractPoints: 30,
        },
        {
          measure: { type: "finalStringEquals", field: "regionalConcentrationStatus", value: "concentrated" },
          atLeast: 1,
          subtractPoints: 40,
        },
      ],
    },
    {
      // Independent, second angle on the same underlying judgment:
      // criticalTimeRatio (time spent with capacitySeverity="critical",
      // i.e. a live Critical-Tier shortfall genuinely happening) plus a
      // direct penalty for ever having reached "deadline-missed" at
      // all, independent of whether it was later corrected.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        { measure: "criticalTimeRatio", atLeast: 0.05, subtractPoints: 40 },
        { measure: "criticalTimeRatio", atLeast: 0.2, subtractPoints: 70 },
        {
          measure: { type: "finalStringEquals", field: "reservationDecisionStatus", value: "deadline-missed" },
          atLeast: 1,
          subtractPoints: 50,
        },
      ],
    },
    {
      // REAL, material cost discriminator (binding per this scenario's
      // brief) — costIncreaseRatio against the baseline's near-zero
      // "reserve nothing" starting point (600 USD/mo). Bands tuned
      // against this scenario's exact authored cost table (revenue-
      // and-cost.ts, verified by this scenario's test suite):
      //   Path B (MID 600/600/600 + fallback): peak 6,120, ratio 9.2
      //   Path A (HIGH 900/900/900):            peak 8,700, ratio 13.5
      //   Maximal-waste trap (HIGH + large contingency):
      //                                         peak 10,050, ratio 15.75
      // Three genuinely distinct cost tiers (95 / 65 / 35 points), never
      // a token gap — Path B scores materially better than Path A here,
      // and the waste trap scores materially worse than both.
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 10, points: 95 },
        { atMost: 14, points: 65 },
        { atMost: 16, points: 35 },
        { atMost: 20, points: 15 },
        { points: 5 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
      ],
    },
  ],
};
