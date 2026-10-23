import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Dead-Letter Queue Explosion's scoring configuration. The central
 * requirement for this scenario (phase6b.md's correctness-heavy batch,
 * and this scenario's specific "discard the DLQ" trap) is that Data
 * Integrity must score low whenever the DLQ was ever discarded, even
 * though discarding also zeroes every operational metric. The primary
 * signal is the generic finalStringEquals measure (same pattern as
 * Missing Database Index's orderHistoryQueryHealth and Kafka Partition
 * Skew's orderingMode) comparing dataLossState against "eventsPurged".
 *
 * Belt-and-suspenders: Data Integrity ALSO penalizes on
 * harmfulChangeCount, since choosing "discard" is itself authored as a
 * harmful action-classification (action-classifications.ts's acr_2) and
 * numberOfHarmfulChanges is an engine-maintained counter that never
 * decrements for the rest of the attempt — unlike dataLossState (read
 * from current `values`, which rules.ts recomputes fresh every tick),
 * this stays depressed even in the edge case where a candidate discards
 * the DLQ and then resets the dlqAction control back to "none"
 * afterward. This is a deliberate defense-in-depth, not duplicated
 * logic: the two measures catch the trap through independent engine
 * primitives (current-value state vs. a monotonic action counter).
 */
export const DEAD_LETTER_QUEUE_EXPLOSION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 200 },
        { atMost: 300, points: 140 },
        { atMost: 480, points: 80 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 5_000, points: 200 },
        { atMost: 15_000, points: 160 },
        { atMost: 30_000, points: 110 },
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: 1 when dataLossState ===
      // "eventsPurged" (the DLQ was discarded), 0 otherwise. The
      // `atMost: 0` band (measured 0, i.e. never discarded) awards full
      // marks; the fallback band (measured 1, discarded) collapses Data
      // Integrity to a small fraction of its max, regardless of how
      // clean every other metric looks. See this file's doc comment for
      // the harmfulChangeCount defense-in-depth penalty layered under
      // the same dimension via a separate check — Data Integrity is the
      // ONLY dimension in this config using `penalties`-adjacent
      // reasoning expressed as a tight band floor instead, since
      // `bands` and `penalties` are mutually exclusive per dimension.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "dataLossState", value: "eventsPurged" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 15 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 115 },
        { atMost: 0.5, points: 80 },
        { atMost: 0.7, points: 45 },
        { points: 15 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.5, points: 85 },
        { atMost: 1.5, points: 60 },
        { atMost: 3, points: 25 },
        { points: 5 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 20 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 40 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
