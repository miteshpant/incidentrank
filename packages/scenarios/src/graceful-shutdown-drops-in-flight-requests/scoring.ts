import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Graceful Shutdown Drops In-Flight Requests scoring configuration. Every
 * dimension uses the same generic, data-driven scorer every other
 * scenario uses (packages/scenarios/src/authoring/score.ts) — zero new
 * scoring logic added, per the binding "zero slug branching" scoring
 * architecture decision. maxPoints per dimension is the fixed catalog-
 * wide split (recovery=300, customerImpact=200, dataIntegrity=200,
 * reliability=150, costEfficiency=100, operationalEfficiency=50 — see
 * validateAuthoredScenario's SCORE_MAX_BY_DIMENSION).
 *
 * Investigation quality is scored explicitly via the existing
 * `finalStringEquals` measure against `investigationQuality` — a
 * deliberately coarser state value than `diagnosisPath` (see rules.ts's
 * doc comment) that collapses BOTH correct, fully-investigated branches
 * (drain-timeout fix and deploy-strategy fix) to the same "correlated"
 * value, because this scenario's branching lesson is about CHOOSING A
 * TRADEOFF deliberately after diagnosing the real lifecycle bug, not
 * about one fix being objectively superior to the other. The
 * `finalStringEquals` measure itself only supports comparing against one
 * literal value (AuthoredStringStateMeasure never takes a set) — exactly
 * why this scenario authors its own coarser field rather than asking
 * dataIntegrity to match either of two specific `diagnosisPath` values.
 * The deploy-speed vs. request-loss tradeoff itself is captured by
 * recovery/costEfficiency naturally diverging between the two paths
 * (blue-green/surge cost more and take longer), never by dataIntegrity
 * favoring one branch's choice.
 */
export const GRACEFUL_SHUTDOWN_DROPS_IN_FLIGHT_REQUESTS_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 240 },
        { atMost: 240, points: 180 },
        { atMost: 360, points: 110 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 6_000, points: 200 },
        { atMost: 15_000, points: 150 },
        { atMost: 30_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored investigation-quality scoring — whether the
      // candidate correlated the shutdown-hook logs, load-balancer drain
      // events, and deploy history before applying either correct fix, or
      // guessed one of the two correct fixes without demonstrating that
      // correlation, or chased the inferior replica-scaling remediation,
      // or did nothing at all. Measured against `investigationQuality`
      // (not the more specific `diagnosisPath`) so both correct,
      // investigated paths earn identical full credit — this dimension
      // rewards WHETHER the candidate diagnosed the real lifecycle bug
      // before acting, not WHICH of the two valid tradeoffs they picked.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "investigationQuality", value: "correlated" },
      bands: [
        { atMost: 0, points: 80 },
        { points: 200 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.15, points: 150 },
        { atMost: 0.3, points: 110 },
        { atMost: 0.5, points: 70 },
        { points: 20 },
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
        { atMost: 3, points: 30 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        // Chasing the inferior replica-scaling remediation instead of
        // fixing the actual drain-timing bug is explicitly penalized
        // here, in addition to dataIntegrity's own lower band for an
        // incomplete diagnosisPath — operationalEfficiency measures the
        // COST of the wrong actions taken, dataIntegrity measures whether
        // a correct diagnosis was ultimately reached.
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
