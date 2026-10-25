import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Enterprise-Wide Dependency Deprecation's scoring configuration (the
 * Phase 6E flagship).
 *
 * SCORING-INTERPRETATION CONSTRAINT: this scenario's primary judgment
 * axis is GOVERNANCE/SEQUENCING CORRECTNESS against a hard external
 * deadline, not classic availability. Every live traffic metric can
 * read close to healthy for most of the incident's duration -- the real
 * signal is whether every product reached a genuinely verified migrated
 * state before the deadline, without ever faking completion, panicking
 * into a forced cutover, or leaving a temporary bridge (dual-support)
 * running indefinitely.
 *
 *   - dataIntegrity (the PRIMARY correctness gate, 200 points):
 *     penalties against overallMigrationStatus -- "complete-with-gaps"
 *     (a fleet that claims done without every product being genuinely
 *     verified -- the mark-without-verification trap), "forced-cutover-
 *     failure" (the deadline-panic trap), and "deadline-breached" (the
 *     wait-too-long trap) each cost the large majority of this
 *     dimension independently, and stack if more than one ever occurred
 *     during the attempt.
 *   - reliability (150 points): criticalTimeRatio against
 *     deadlineRiskStatus (a severity-field-shaped string tracked via
 *     this scenario's own vocabulary -- see definition.ts's
 *     severityFields) -- time spent with deadline risk genuinely
 *     elevated/critical/breached, independent of live traffic health.
 *   - recovery (300) / customerImpact (200): the standard
 *     recoveryTimeSeconds/revenueLossUsd measures -- real, but secondary
 *     to the two gates above, mirroring every other Phase 6E Principal
 *     scenario's priority ordering.
 *   - costEfficiency (100): costIncreaseRatio -- real and honestly
 *     discriminating here since baseline infra cost is NOT pre-inflated
 *     (see revenue-and-cost.ts): every cost increase comes from a
 *     candidate's own choice to run the Compatibility Layer and/or
 *     dual-support longer than strictly needed.
 *   - operationalEfficiency (50): penalties against harmfulChangeCount/
 *     configurationChangeCount. This scenario's two independent,
 *     non-resetting historical-debt counters
 *     (dualSupportDebtAccumulatedMs / compatibilityLayerDebtAccumulatedMs)
 *     are numericWatchFields (peak-tracked, candidate-visible, and
 *     exercised directly by this scenario's test suite as the required
 *     non-resetting historical-consequence proof) rather than a THIRD
 *     scoring penalty source -- the real consequence of leaving either
 *     bridge lever on indefinitely is already captured honestly via (a)
 *     dataIntegrity's overallMigrationStatus penalties (the
 *     dual-support-left-indefinite/compatibility-layer-active-unused-
 *     indefinite states both set overallMigrationStatus accordingly)
 *     and (b) costEfficiency's costIncreaseRatio (both levers carry a
 *     real, ongoing infrastructure cost -- see revenue-and-cost.ts).
 *     Double-penalizing the same debt a third time via
 *     operationalEfficiency would distort the fixed six-dimension
 *     envelope rather than honestly reflect one real consequence once.
 */
export const ENTERPRISE_WIDE_DEPENDENCY_DEPRECATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 420, points: 300 },
        { atMost: 480, points: 260 },
        { atMost: 560, points: 210 },
        { atMost: 650, points: 150 },
        { points: 80 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 900, points: 160 },
        { atMost: 2_000, points: 100 },
        { atMost: 4_000, points: 45 },
        { points: 10 },
      ],
    },
    {
      // PRIMARY correctness gate. See module doc comment: penalties
      // stack independently so an attempt that both faked completion
      // AND forced an unsafe cutover loses more than either alone.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "overallMigrationStatus", value: "complete-with-gaps" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "overallMigrationStatus", value: "forced-cutover-failure" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "overallMigrationStatus", value: "deadline-breached" },
          atLeast: 1,
          subtractPoints: 170,
        },
      ],
    },
    {
      // Time spent with deadline risk genuinely elevated/critical/
      // breached -- never time spent with live traffic degraded (no
      // rule in this scenario ever degrades live traffic health
      // meaningfully outside the forced-cutover/wait-too-long traps,
      // and even those are captured here via the severity field, not
      // via componentHealth).
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.05, points: 150 },
        { atMost: 0.15, points: 105 },
        { atMost: 0.3, points: 60 },
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
        { atMost: 0.08, points: 75 },
        { atMost: 0.15, points: 50 },
        { atMost: 0.3, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 10 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 25 },
        { measure: "configurationChangeCount", atLeast: 14, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 20, subtractPoints: 10 },
      ],
    },
  ],
};
