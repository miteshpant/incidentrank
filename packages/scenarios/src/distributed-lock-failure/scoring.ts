import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Distributed Lock Failure's scoring configuration.
 *
 * The real correctness signal this scenario models is
 * correctnessViolationCount (rules.ts) — the direct, authored evidence
 * of a conflicting write actually landing on the shared resource. That
 * field alone cannot be banded by the generic scorer (there is no
 * closed numeric "finalValueAtMost"-style measure in
 * AuthoredScoringMeasure — only the fixed measures plus the two
 * generic string-state comparisons), so, following Missing Database
 * Index's orderHistoryQueryHealth and Kafka Partition Skew's
 * orderingMode precedent, this scenario carries a generic string-state
 * field — lockSafetyMechanism — that records WHY the system is
 * currently free of correctness violations, not merely THAT it is:
 *
 *   "fenced"     — ownership is validated at write time. A stale
 *                   write from a superseded owner is rejected rather
 *                   than applied, so correctnessViolationCount stays
 *                   zero independent of lease duration and independent
 *                   of any future worker crash. The durable fix.
 *   "renewed"    — safe only because every worker involved so far has
 *                   stayed alive long enough to keep heartbeating. A
 *                   worker crash is a real, latent risk this
 *                   mechanism does not cover (see resourceBlockedSeconds
 *                   in the renewal-enabled-crash-* rules).
 *   "unresolved" — no safety mechanism has engaged; either the
 *                   incident has not been touched, or the state is
 *                   actively showing correctness violations right now.
 *
 * dataIntegrity bands on finalStringNotEquals("fenced") generically
 * (packages/scenarios/src/authoring/score.ts) — "fenced" scores full
 * marks, every other value (including the healthy-looking "renewed"
 * state, and every unsafe "unresolved" state) scores the lower band.
 * This is deliberate: "renewed" is genuinely safe RIGHT NOW (it would
 * also satisfy successCondition), but it carries a real, uncovered
 * crash-correctness risk that "fenced" does not — Data Integrity is
 * exactly the dimension that should discriminate "safe because
 * ownership is actually validated" from "safe because nothing bad has
 * happened yet," independent of recovery speed or customer impact,
 * both of which can legitimately tie between the two paths.
 */
export const DISTRIBUTED_LOCK_FAILURE_SCORING: AuthoredScoringConfig = {
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
        { atMost: 5_000, points: 200 },
        { atMost: 15_000, points: 160 },
        { atMost: 30_000, points: 110 },
        { atMost: 55_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: 0 when lockSafetyMechanism ===
      // "fenced" (the durable, crash-safe fix), 1 otherwise — including
      // the "renewed" safe-but-latent-risk state and every unresolved/
      // harmful state. No scenario-specific scorer code.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringNotEquals", field: "lockSafetyMechanism", value: "fenced" },
      bands: [
        { atMost: 0, points: 200 },
        { points: 70 },
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
