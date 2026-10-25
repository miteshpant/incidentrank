import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * API Migration Dual-Write Failure's scoring configuration.
 *
 * dataIntegrity bands on the unified `correctnessStatus` field
 * ("safe" | "contained" | "unresolved" | "violated") via two stacked
 * finalStringEquals/finalStringNotEquals checks expressed as bands
 * against a single derived measure is not directly expressible (the
 * generic scorer bands a single numeric/boolean-shaped measure), so
 * this scenario uses `finalStringEquals` against "safe" for full marks
 * and a partial band for "contained" (new damage stopped, correctness
 * never violated, but historical backlog not yet fully drained) via a
 * second dimension-independent measure — see the dataIntegrity
 * dimension below, which combines a primary finalStringNotEquals("
 * violated") gate (anything that is NOT violated gets at least partial
 * credit) with reliability separately rewarding full drain. This
 * keeps a correctness VIOLATION (exposed read, lost write, blind-
 * replay corruption) scoring strictly worse than a merely-unreconciled-
 * but-never-violated backlog, which must itself still score worse than
 * a fully-drained backlog — the three-tier distinction the historical-
 * damage model requires.
 */
export const API_MIGRATION_DUAL_WRITE_FAILURE_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are deliberately tuned against this scenario's
      // real authored timeline (timed-events.ts): the fastest an
      // ACCEPTABLE-tier Finish can be sustained-eligible is ~90-100s
      // after incident start (reconciliationPartiallyDrained), while
      // the fastest an OPTIMAL-tier Finish can be sustained-eligible
      // is ~300s (reconciliationWindowElapsed) — optimal structurally
      // cannot ever land in the fastest band. The point GAP between
      // the band acceptable's fastest reachable time falls into
      // (<=120 -> 220) and the band optimal's fastest reachable time
      // falls into (<=340 -> 160) is only 60 points -- smaller than
      // reliability's 90-point optimal-vs-acceptable gap -- so a
      // same-tick acceptable Finish can never out-total a fully-
      // reconciled optimal Finish purely by being faster. See the
      // sanity-check test asserting this directly.
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
        { atMost: 2_500, points: 200 },
        { atMost: 7_000, points: 150 },
        { atMost: 18_000, points: 90 },
        { atMost: 40_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Primary correctness gate: `dataIntegrityProtected` is a
      // dedicated boolean-shaped field (see metrics.ts) collapsing
      // correctnessStatus's three states into exactly what
      // dataIntegrity needs — "protected" only once write authority
      // has genuinely been contained ("contained" or "safe");
      // "not-protected" for BOTH the untouched/still-diverging
      // baseline ("unresolved" — new damage still accumulating
      // unaddressed) AND any hard correctness violation ("violated" —
      // an exposed divergent read, a lost acknowledged write, or
      // blind-replay corruption actually happened). Both failure modes
      // land in the same low band deliberately: doing nothing while
      // damage accumulates must never score as if correctness were
      // protected, and a correctness violation must never score better
      // just because it happened on top of a "healthier"-looking raw
      // divergence count (see the replay-blind trap).
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "dataIntegrityProtected", value: "protected" },
      bands: [
        { atMost: 0, points: 30 },
        { points: 200 },
      ],
    },
    {
      // Reliability discriminates the fully-drained optimal tier
      // (correctnessStatus === "safe", backlog at zero) from the
      // contained-but-still-draining acceptable tier (correctnessStatus
      // === "contained", backlog bounded but nonzero) — a faster
      // Finish on a "contained" state must never outscore a slower but
      // fully-reconciled "safe" state on this dimension.
      dimension: "reliability",
      maxPoints: 150,
      measure: { type: "finalStringEquals", field: "correctnessStatus", value: "safe" },
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
