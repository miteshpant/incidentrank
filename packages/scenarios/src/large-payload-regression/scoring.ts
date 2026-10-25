import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Large Payload Regression's scoring configuration. This scenario has
 * no acceptable tier (see definition.ts's completion-mode audit: every
 * reachable non-optimal stable state is either still critical or
 * actively breaking callers via silent truncation, never a genuine
 * safe-but-imperfect handback) — so dataIntegrity's job is narrower than
 * Missing Database Index's: it does not need to discriminate optimal
 * from acceptable (there is no acceptable), it only needs to confirm
 * that whenever the attempt resolved, it resolved because the shape was
 * actually fixed (payloadShapeHealth === "shape-fixed"), never because
 * truncation or scaling happened to make the numbers look survivable.
 * Since resolution is only reachable via successCondition here (no
 * acceptableCondition), a resolved attempt's payloadShapeHealth is
 * always "shape-fixed" by construction — this measure instead earns
 * its keep by penalizing a candidate who left the attempt sitting in
 * the truncation state at timeout (an unresolved attempt whose final
 * state is actively harmful, not merely incomplete), the same generic
 * string-state measure pattern as Missing Database Index/Kafka
 * Partition Skew, never scenario-specific scorer code.
 */
export const LARGE_PAYLOAD_REGRESSION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 250 },
        { atMost: 180, points: 190 },
        { atMost: 300, points: 130 },
        { atMost: 480, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 6_000, points: 200 },
        { atMost: 18_000, points: 160 },
        { atMost: 35_000, points: 110 },
        { atMost: 60_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: 1 when the final state is the
      // truncation trap (payloadShapeHealth === "feature-limited"), 0
      // otherwise — including every genuinely resolved ("shape-fixed")
      // attempt and every still-unresolved-but-not-truncating attempt
      // alike. The `atMost: 0` band therefore awards full marks unless
      // the candidate left the system silently truncating callers' data.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "payloadShapeHealth", value: "feature-limited" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 40 },
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
        { atMost: 0.4, points: 80 },
        { atMost: 1, points: 55 },
        { atMost: 2, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
