import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Idempotency Failure's scoring configuration. The central product
 * requirement (phase6c.md's binding instruction for this scenario): a
 * final state with duplicateSideEffectCount > 0, OR a final state where
 * legitimate work was silently suppressed (duplicationSafetyStatus ===
 * "unsafe-suppressing"), must never score as well on Data Integrity as a
 * state that is genuinely safe — REGARDLESS of how healthy
 * requestSuccessRatePct or externalSideEffectRatePerMin look.
 * dataIntegrity bands generically on duplicationSafetyStatus (rules.ts's
 * real, authored classification of the final state) via
 * finalStringEquals — the same closed generic measure Kafka Partition
 * Skew/Missing Database Index/Duplicate Event Processing already use,
 * never a scenario-specific scorer. measureDimension returns 1 (matches)
 * only when duplicationSafetyStatus === "safe" (the real duplicate
 * counter is zero AND nothing was wrongly suppressed), and 0 for every
 * other reachable state, including both fail-open-while-unreachable
 * traps where throughput/success-rate metrics look healthy or even
 * elevated.
 */
export const IDEMPOTENCY_FAILURE_SCORING: AuthoredScoringConfig = {
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
      // Generic string-state measure. "safe" (measured 1) earns the
      // full 200; every other final state — including both fail-open
      // traps where success rate/throughput look fine or even elevated,
      // and the too-broad-scope suppression trap where duplicate count
      // itself stays near zero — measures 0 and falls to the floor
      // band. This is the dimension that must actually drop for an
      // available-but-corrupt (or available-but-silently-dropping)
      // final state; verified directly in idempotency-failure.test.ts.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "duplicationSafetyStatus", value: "safe" },
      bands: [
        { atMost: 0, points: 20 },
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
