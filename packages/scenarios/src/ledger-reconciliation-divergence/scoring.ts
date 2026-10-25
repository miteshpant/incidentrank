import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Ledger Reconciliation Divergence's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase6d.2.md section 12's explicit instruction for this scenario
 * class): a path with settlement duplication, lost acknowledged
 * writes, or discarded exceptions must score materially worse even if
 * recovery time / customer-impact metrics look excellent. The generic
 * scorer's literal "dataIntegrity" measure always returns 0 (see
 * score.ts's measureDimension) and there is no numeric-threshold
 * penalty measure in the generic scorer (AuthoredScoringMeasure has
 * only the two string-state forms, finalStringEquals/NotEquals — see
 * schema.ts), so this dimension uses `penalties` mode entirely against
 * two closed-enum string-state fields authored specifically for
 * scoring: reconciliationStatus (the single authoritative correctness
 * summary — "diverging" / "frozen-unrepaired" / "draining" /
 * "reconciled" / "discarded-violation") and duplicationSeverity (a
 * dedicated three-value severity banding of duplicateSettlementEntryCount
 * — "none" / "moderate" / "severe" — since the raw count itself has no
 * generic numeric measure to penalize against).
 *
 * Penalty stacking (score.ts's applyPenalties): within one measure,
 * only the tightest-matching threshold applies (irrelevant here since
 * each measure's penalties target mutually exclusive enum values, so
 * at most one ever matches per measure); across different measures,
 * matching penalties stack additively. reconciliationStatus =
 * "discarded-violation" and duplicationSeverity = "moderate" co-occur
 * in this scenario's rule table for the discard-trap states, so
 * authoring both loses credit from two independent angles —
 * deliberately, since discarding acknowledged customer transactions is
 * the single worst outcome this scenario can produce.
 */
export const LEDGER_RECONCILIATION_DIVERGENCE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to THIS scenario's real authored
      // timeline, not a generic availability-incident clock: the
      // fastest possible genuine full reconciliation (fully-reconciled)
      // requires waiting out the longest repair-drain window on top of
      // the sustained-divergence onset -- recoveryTimeSeconds ~750-820s
      // is the BEST a candidate can do for full OPTIMAL resolution, so
      // it must land in this dimension's top band, not be penalized
      // for "taking too long" by bands copied from a faster-incident
      // scenario. A genuinely slow/wasteful recovery (never engaging
      // repair, or engaging it very late) still lands in a lower band.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 300, points: 300 },
        { atMost: 500, points: 280 },
        { atMost: 850, points: 250 },
        { atMost: 1_100, points: 170 },
        { atMost: 1_400, points: 100 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 900, points: 160 },
        { atMost: 1_800, points: 110 },
        { atMost: 3_200, points: 60 },
        { points: 10 },
      ],
    },
    {
      // See module doc comment: penalties mode on two closed-enum
      // string-state fields. A fully "reconciled" path with
      // duplicationSeverity "none" keeps the full 200 points. A
      // "draining" path (the acceptable tier — genuinely safe, backlog
      // bounded and shrinking, but historical correctness not yet
      // fully restored) loses a modest, real amount of credit relative
      // to full reconciliation — acceptable is a legitimate handback,
      // not a free equivalent to actually finishing the repair.
      // "frozen-unrepaired" is NOT penalized further here on
      // reconciliationStatus alone beyond "draining" would be — in
      // practice it is never Finish-eligible at all (see
      // revenue-and-cost.ts's acceptableCondition gate), so this
      // dimension's job for that state is moot; what matters is that
      // correctness-DESTROYING paths (duplication amplified via
      // replay-unsafe or unsuppressed high concurrency -> "severe";
      // discarding acknowledged entries -> "discarded-violation") lose
      // real, material credit well beyond the draining tier's modest
      // deduction.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "reconciliationStatus", value: "diverging" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "reconciliationStatus", value: "draining" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "reconciliationStatus", value: "frozen-unrepaired" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "reconciliationStatus", value: "discarded-violation" },
          atLeast: 1,
          subtractPoints: 190,
        },
        {
          measure: { type: "finalStringEquals", field: "duplicationSeverity", value: "moderate" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "duplicationSeverity", value: "severe" },
          atLeast: 1,
          subtractPoints: 110,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.1, points: 150 },
        { atMost: 0.25, points: 115 },
        { atMost: 0.45, points: 80 },
        { atMost: 0.65, points: 45 },
        { points: 15 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1.2, points: 25 },
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
