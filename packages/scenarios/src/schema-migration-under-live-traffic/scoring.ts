import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Schema Migration Under Live Traffic's scoring configuration.
 *
 * dataIntegrity gates on `dataIntegrityProtected` (a dedicated boolean-
 * shaped field — see metrics.ts) collapsing compatibilityStatus's three
 * states into exactly what dataIntegrity needs: "protected" only once
 * new incompatible-row creation has genuinely stopped ("contained" or
 * "safe"); "not-protected" for BOTH the untouched/still-broken baseline
 * ("unresolved" — new damage still accumulating unaddressed) AND any
 * hard correctness violation ("violated" — an unreadable read or a
 * discarded acknowledged write actually happened). Both failure modes
 * land in the same low band deliberately: doing nothing while damage
 * accumulates must never score as if correctness were protected, and a
 * correctness violation must never score better just because it
 * happened on top of a frozen (not growing) backlog.
 *
 * reliability discriminates the fully-repaired optimal tier
 * (compatibilityStatus === "safe", backlog at zero) from the
 * contained-but-still-draining acceptable tier (compatibilityStatus
 * === "contained", backlog bounded but nonzero) — a faster Finish on a
 * "contained" state must never outscore a slower but fully-repaired
 * "safe" state on this dimension.
 */
export const SCHEMA_MIGRATION_UNDER_LIVE_TRAFFIC_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are tuned against this scenario's authored
      // timeline (timed-events.ts): the fastest an ACCEPTABLE-tier
      // Finish can be sustained-eligible is ~90-130s after incident
      // start (backfillPartiallyDrained), while the fastest an
      // OPTIMAL-tier Finish can be sustained-eligible is ~300-330s
      // (backfillWindowElapsed) — optimal structurally cannot ever
      // land in the fastest band.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 120, points: 220 },
        { atMost: 340, points: 160 },
        { atMost: 480, points: 100 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 2_000, points: 200 },
        { atMost: 6_000, points: 150 },
        { atMost: 15_000, points: 90 },
        { atMost: 35_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "dataIntegrityProtected", value: "protected" },
      bands: [
        { atMost: 0, points: 30 },
        { points: 200 },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: { type: "finalStringEquals", field: "compatibilityStatus", value: "safe" },
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0, points: 60 },
        { points: 150 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.25, points: 80 },
        { atMost: 0.5, points: 55 },
        { atMost: 0.9, points: 30 },
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
