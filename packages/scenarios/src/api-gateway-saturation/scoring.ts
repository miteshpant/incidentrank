import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * API Gateway Saturation's scoring configuration. This scenario has no
 * acceptable tier (see definition.ts's completion-mode audit) — the
 * only genuinely safe-to-hand-back state is the real fix
 * (gatewaySaturationHealth === "fixed"). The bypass trap
 * (authMiddlewareMode === "bypass") clears every numeric metric but is
 * a correctness/security violation, not a legitimate tradeoff, so
 * dataIntegrity bands on gatewaySaturationHealth generically via
 * finalStringEquals (same pattern as Missing Database Index's
 * orderHistoryQueryHealth / Kafka Partition Skew's orderingMode)
 * rather than letting the numeric metrics alone decide the outcome —
 * a candidate who bypasses auth must score materially worse on
 * dataIntegrity than one who did not, even though both may reach
 * identical gatewayCpuUtilization/gatewayStatus values.
 */
export const API_GATEWAY_SATURATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 150, points: 250 },
        { atMost: 240, points: 190 },
        { atMost: 360, points: 130 },
        { atMost: 540, points: 70 },
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
      // Generic string-state measure comparing gatewaySaturationHealth
      // against "bypassed". measureDimension returns 1 when it matches
      // (the auth-bypass trap: numerically clean but a correctness/
      // security violation) and 0 otherwise (the real fix, the
      // lightweight-auth alternate fix, and every still-unresolved/
      // harmful/partial path alike) — so the `atMost: 0` band (measured
      // 0) awards full marks to "auth stayed enforced," and only the
      // bypass path falls through to the lower fallback band.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "gatewaySaturationHealth", value: "bypassed" },
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
