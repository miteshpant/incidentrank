import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cross-Service Retry Amplification's scoring configuration. Two
 * generic string-state fields (set by rules.ts) drive the two
 * repurposed dimensions below — never a scenario-specific scorer;
 * purely declarative bands/penalties over ScoringInputs.
 *
 * retryOwnershipMode: "owned-service-c" means the candidate correctly
 * consolidated retries to exactly one layer adjacent to the provider;
 * "partial-gateway-only"/"partial-service-a-only"/
 * "partial-gateway-and-a-only" mean one or two layers stood down while
 * amplification persists through the remaining ones (the authored
 * pressure-transfer trap); "unowned" means no genuine ownership
 * decision was made at all. dataIntegrity (repurposed here as the
 * scenario's "did you solve the actual ownership problem" dimension —
 * this scenario has no data-correctness violation of its own, so this
 * dimension measures retry-ownership correctness instead, the same way
 * other scenarios repurpose it for their own defining correctness
 * signal) penalizes via finalStringNotEquals/finalStringEquals measures
 * so a genuine partial-ownership state scores strictly between full
 * ownership and no ownership decision at all — never tied with either.
 *
 * hardeningMode: once ownership is correctly consolidated, "full" means
 * both secondary safeguards (circuit breaker, cancellation propagation)
 * are applied; "partial" means exactly one is; "none" means ownership
 * is correct but neither safeguard is applied yet; "n/a" means
 * ownership itself was never consolidated. reliability (repurposed here
 * as the hardening-completeness dimension, since this scenario's
 * "critical time" is already fully captured by how amplification
 * itself behaves, which dataIntegrity and customerImpact already
 * price in) penalizes via finalStringNotEquals/finalStringEquals
 * measures so the OPTIMAL tier (full hardening) scores strictly above
 * the ACCEPTABLE tier (partial hardening) even when both recover
 * equally fast and incur identical revenue loss.
 */
export const CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 180, points: 250 },
        { atMost: 300, points: 190 },
        { atMost: 480, points: 130 },
        { atMost: 720, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 3_000, points: 200 },
        { atMost: 10_000, points: 160 },
        { atMost: 25_000, points: 110 },
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Penalty mode, starting at full marks (200). Two independent
      // (different-measure) penalties stack additively:
      //   - "not owned at Service C" fires for every mode except the
      //     fully correct "owned-service-c" — subtracts 70.
      //   - "is unowned" fires only when NO genuine ownership decision
      //     was ever made (the partial-layer traps still count as a
      //     real, if incomplete, ownership decision and must score
      //     above this) — subtracts a further 90.
      // This produces exactly three distinct, candidate-meaningful
      // outcomes:
      //   owned-service-c                    -> 200 (0 subtracted)
      //   partial-gateway-only/service-a-only -> 130 (70 subtracted:
      //                                           a real, if
      //                                           incomplete, decision)
      //   unowned (no decision made at all)   ->  40 (70+90
      //                                           subtracted)
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "retryOwnershipMode", value: "owned-service-c" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "retryOwnershipMode", value: "unowned" },
          atLeast: 1,
          subtractPoints: 90,
        },
      ],
    },
    {
      // Penalty mode: starts at full marks (150) and subtracts for
      // incomplete secondary hardening (breaker + cancellation
      // propagation) ONCE ownership is already correctly consolidated
      // — this is what actually distinguishes the OPTIMAL tier
      // (hardeningMode "full") from the ACCEPTABLE tier (hardeningMode
      // "partial") for recovery/customerImpact-identical attempts,
      // since both tiers recover quickly and incur minimal critical
      // time. A real, authored distinction rather than a tie:
      //   full    -> 150 (0 subtracted)
      //   partial -> 90  (60 subtracted: exactly one secondary
      //                   safeguard missing)
      //   none    -> 40  (110 subtracted: ownership correct but
      //                   neither safeguard applied)
      //   n/a     -> 40  (ownership itself not consolidated — the
      //                   dataIntegrity dimension already penalizes
      //                   this separately; this dimension still
      //                   reflects that no hardening decision was
      //                   ever reached)
      // Three independent (different-measure) penalties stack
      // additively; "none" and "n/a" are mutually exclusive values of
      // the same field, so at most one of those two ever fires
      // alongside the "not full" penalty for any given attempt.
      dimension: "reliability",
      maxPoints: 150,
      terminalOverrides: { failed: 0, unresolved: 0 },
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "hardeningMode", value: "full" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "hardeningMode", value: "none" },
          atLeast: 1,
          subtractPoints: 50,
        },
        {
          measure: { type: "finalStringEquals", field: "hardeningMode", value: "n/a" },
          atLeast: 1,
          subtractPoints: 50,
        },
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
