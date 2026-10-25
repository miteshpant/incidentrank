import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cache Revalidation Herd's scoring configuration. This scenario has no
 * data-loss/duplication/ordering concept — the three optimal paths
 * (jitter, single-flight coalescing, stale-while-revalidate) all reach
 * the exact same genuinely safe, non-recurring successCondition, so
 * dataIntegrity awards full marks via a single catch-all band rather
 * than fabricating a distinguishing measure that doesn't exist for this
 * scenario (same documented pattern as Cache Stampede's scoring.ts).
 *
 * recovery/reliability both zero out via terminalOverrides.unresolved
 * for every non-resolved outcome (baseline herding, the scaled-fleet
 * trap, the short-backoff trap, and the concurrency-masking partial
 * mitigation all end "unresolved" within this scenario's failure
 * window) — customerImpact and costEfficiency are the dimensions that
 * discriminate "visibly reduced live harm without a full fix" from
 * "did nothing" or "made it worse", tuned against this scenario's own
 * revenueLossRatePerMinute table (concurrency-masked 220 < herding 560
 * < herd-retry-amplifying 700 < retry-amplified 760 < scaled-herd 900
 * USD/min).
 */
export const CACHE_REVALIDATION_HERD_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 45, points: 300 },
        { atMost: 90, points: 250 },
        { atMost: 150, points: 200 },
        { atMost: 240, points: 140 },
        { atMost: 420, points: 80 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 900, points: 140 },
        { atMost: 2_000, points: 80 },
        { points: 25 },
      ],
    },
    {
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: "dataIntegrity",
      bands: [{ points: 200 }],
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
        { atMost: 1, points: 90 },
        { atMost: 4, points: 60 },
        { points: 30 },
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
