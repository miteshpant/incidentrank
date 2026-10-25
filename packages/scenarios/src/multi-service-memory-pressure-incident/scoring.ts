import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Multi-Service Memory Pressure Incident's scoring configuration. This
 * scenario has no data-loss/duplication/ordering concept, but it does
 * have THREE real, candidate-visible, string-state-tracked distinctions
 * (all set by rules.ts, read generically via finalStringEquals — never
 * a scenario-specific scorer), which dataIntegrity penalizes
 * independently and additively:
 *
 *   1. rootCauseHealth === "unaddressed" — the candidate never applied
 *      either real root-cause fix.
 *   2. fleetIntegrityHealth === "churn-scarred" — the fleet has, at any
 *      point, gone through real restart/OOM churn. This is DELIBERATELY
 *      a SEPARATE field from rootCauseHealth: once churn has occurred,
 *      rootCauseHealth can later read "resolved" (current config is
 *      genuinely clean) while fleetIntegrityHealth stays permanently
 *      "churn-scarred" — the historical-damage doctrine (phase6d.4.md
 *      section 13 / section 17's suspicious-score check) requires the
 *      scar to still cost real points even once current health looks
 *      perfect.
 *   3. correctnessBoundHealth === "violated" — ONLY the maxResponseSizeKb
 *      truncation trap sets this; every other state (including every
 *      merely-unaddressed-root-cause state) stays "respected". A real
 *      correctness violation is a strictly worse failure mode than
 *      simply "not yet fixed" (section 17's "correctness/security-
 *      violating path heavily penalized" check), so this stacks on top
 *      of the rootCauseHealth penalty rather than being folded into it.
 *
 * See "root-cause-fixed-field/concurrency-after-churn-scarred" and
 * "max-response-size-truncation-violation" in rules.ts, and the
 * score-sanity audit in the completion report for the concrete numbers
 * proving each penalty applies independently.
 */
export const MULTI_SERVICE_MEMORY_PRESSURE_INCIDENT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      // Recovery time is measured from incident start (the earlier
      // shape-change-shipped timed event) to the moment the ACCEPTED
      // tier's own sustain window stabilized (deriveScoringResolvedAtMs)
      // — never the moment the fix was clicked. The mandatory GC/heap
      // decay window (90s from Dependency A's onset) plus the 40s
      // between shape-change-shipped and Dependency A's onset means
      // even the fastest possible genuine fix (applied the instant
      // Dependency A starts thrashing) cannot land faster than
      // ~130-145s real elapsed time — so the top band is calibrated to
      // that genuine floor, never an unreachable number.
      bands: [
        { atMost: 150, points: 300 },
        { atMost: 210, points: 250 },
        { atMost: 280, points: 190 },
        { atMost: 360, points: 130 },
        { atMost: 460, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      terminalOverrides: { failed: 0 },
      bands: [
        { atMost: 3_000, points: 200 },
        { atMost: 10_000, points: 160 },
        { atMost: 25_000, points: 110 },
        { atMost: 50_000, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Penalty mode (not bands) so TWO independent string-state
      // measures can stack additively — see the file-level doc
      // comment. rootCauseHealth === "unaddressed" penalizes "the
      // actual fix was never applied" (also true for the truncation
      // trap, which never shrinks the Aggregator's real object).
      // fleetIntegrityHealth === "churn-scarred" separately penalizes
      // "real historical damage occurred," and — critically — this
      // penalty still applies even once rootCauseHealth later reads
      // "resolved," which is exactly what keeps a late fix from
      // improperly erasing the cost of damage that already happened
      // (phase6d.4.md section 17).
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "rootCauseHealth", value: "unaddressed" },
          atLeast: 1,
          subtractPoints: 170,
        },
        {
          measure: { type: "finalStringEquals", field: "fleetIntegrityHealth", value: "churn-scarred" },
          atLeast: 1,
          subtractPoints: 90,
        },
        // A THIRD, independent, heavier penalty specifically for the
        // maxResponseSizeKb truncation trap — a correctness violation
        // is a strictly worse failure mode than merely "the root cause
        // was never fixed" (phase6d.4.md section 17's "correctness/
        // security-violating availability path heavily penalized"
        // check). Stacks on top of the rootCauseHealth penalty above
        // (the truncation trap also always leaves rootCauseHealth
        // "unaddressed"), flooring this dimension at 0 for that path.
        {
          measure: { type: "finalStringEquals", field: "correctnessBoundHealth", value: "violated" },
          atLeast: 1,
          subtractPoints: 60,
        },
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
        { atMost: 0.3, points: 80 },
        { atMost: 0.7, points: 55 },
        { atMost: 1.5, points: 25 },
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
