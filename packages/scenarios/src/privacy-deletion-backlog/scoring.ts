import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Privacy Deletion Backlog's scoring configuration.
 *
 * SCORING-INTERPRETATION CONSTRAINT (binding for this scenario, same
 * doctrine as Data Retention Policy Misconfiguration): the real judgment
 * here is EXECUTION COMPLETENESS correctness — whether an accepted
 * deletion request actually finished everywhere it needed to, and
 * whether the system ever asserted something false about that — while
 * requestAcceptanceSuccessRate never moves in any rule (see rules.ts)
 * and is never read by any scoring measure below. dataIntegrity and
 * reliability carry the real judgment; customerImpact/recovery are
 * deliberately made to discriminate less sharply, since "how fast you
 * got the dashboard green" is explicitly not the primary signal this
 * scenario tests.
 *
 *   - dataIntegrity (the PRIMARY correctness gate): penalties mode
 *     against deletionWorkflowStatus for each of the three independent
 *     live violations (false-complete-active, deadline-breach-active,
 *     untracked-gap-active — the authored string only ever holds one of
 *     these at a time per rule, so these three penalties are mutually
 *     exclusive in practice, but are authored independently so any
 *     future rule combining two simultaneously would still be penalized
 *     correctly) plus an independent penalty against
 *     backupIndexTrackingStatus="untracked" (catches the untracked-gap
 *     state even if a future rule ever paired it with a different
 *     deletionWorkflowStatus value), plus a smaller "still draining, not
 *     yet fully re-verified" penalty that separates ACCEPTABLE from
 *     OPTIMAL.
 *   - reliability: criticalTimeRatio against deletionIntegritySeverity
 *     — time spent with a correctness violation genuinely live, never
 *     time spent merely draining an honestly-tracked backlog.
 *   - customerImpact: revenueLossUsd — wide bands, genuinely secondary.
 *   - recovery: recoveryTimeSeconds — wide bands, genuinely secondary.
 *   - costEfficiency: costIncreaseRatio — a minor, secondary signal;
 *     every real cost increase here comes from a candidate's OWN choice
 *     (deletionWorkerAllocation=scaled-up, retryPolicy=aggressive)
 *     layered on top of an unmodified baseline, so costIncreaseRatio
 *     correctly reads >0 for those and 0 for every path that never
 *     touches either lever.
 */
export const PRIVACY_DELETION_BACKLOG_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 700, points: 300 },
        { atMost: 950, points: 270 },
        { atMost: 1_200, points: 230 },
        { atMost: 1_500, points: 180 },
        { points: 120 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 200, points: 200 },
        { atMost: 600, points: 170 },
        { atMost: 1_400, points: 120 },
        { atMost: 2_500, points: 60 },
        { points: 15 },
      ],
    },
    {
      // PRIMARY execution-completeness correctness gate. Penalties
      // stack independently so a state that somehow combined two
      // violations would lose more than either alone; in practice each
      // authored rule only ever sets one violation at a time.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "deletionWorkflowStatus", value: "false-complete-active" },
          atLeast: 1,
          subtractPoints: 140,
        },
        {
          measure: { type: "finalStringEquals", field: "deletionWorkflowStatus", value: "deadline-breach-active" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "deletionWorkflowStatus", value: "untracked-gap-active" },
          atLeast: 1,
          subtractPoints: 110,
        },
        {
          measure: { type: "finalStringEquals", field: "backupIndexTrackingStatus", value: "untracked" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          // Separates ACCEPTABLE (still draining, no live violation) from
          // OPTIMAL (100% fully re-verified) — without this, both tiers
          // would score byte-identically on every dimension since
          // recovery/customerImpact bands are deliberately wide, exactly
          // the #88-style scoring flaw this batch must avoid.
          measure: { type: "finalStringEquals", field: "deletionWorkflowStatus", value: "backlog-draining" },
          atLeast: 1,
          subtractPoints: 20,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.05, points: 150 },
        { atMost: 0.15, points: 100 },
        { atMost: 0.3, points: 55 },
        { atMost: 0.5, points: 25 },
        { points: 5 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.05, points: 75 },
        { atMost: 0.1, points: 50 },
        { atMost: 0.2, points: 25 },
        { points: 10 },
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
