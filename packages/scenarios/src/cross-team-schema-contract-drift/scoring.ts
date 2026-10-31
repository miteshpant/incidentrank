import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Cross-Team Schema Contract Drift's own scoring configuration. Uses the
 * same generic, data-driven scorer every other scenario uses
 * (packages/scenarios/src/authoring/score.ts) — zero new scoring logic,
 * zero slug branching, per the binding Phase 6 scoring architecture
 * decision. maxPoints per dimension is the fixed catalog-wide split
 * (recovery=300, customerImpact=200, dataIntegrity=200, reliability=150,
 * costEfficiency=100, operationalEfficiency=50 — see
 * validateAuthoredScenario's SCORE_MAX_BY_DIMENSION and the Phase 10G
 * correction documented on the Checkout/Payment/Inventory/Redis
 * reference incident's own scoring.ts).
 *
 * Investigation-quality/triage-prioritization is scored explicitly via
 * the existing `finalStringEquals` measure against the `diagnosisPath`
 * state value rules.ts authors directly — never inferred from
 * roleInIncident tags, which are reserved for the post-incident
 * narrative only. dataIntegrity awards full points only when all three
 * independently-owned consumers were actually remediated
 * ("fully-recovered-all-three") — fixing only the loudest pipeline
 * (Fraud Detection) while leaving Billing/Analytics silently broken, or
 * publishing the shim alone with no consumer-side follow-up, both land
 * in the lower band, directly encoding this scenario's triage/
 * prioritization-across-multiple-independent-failures lesson.
 */
export const CROSS_TEAM_SCHEMA_CONTRACT_DRIFT_SCORING: AuthoredScoringConfig = {
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
        { atMost: 8_000, points: 200 },
        { atMost: 20_000, points: 150 },
        { atMost: 40_000, points: 90 },
        { points: 20 },
      ],
    },
    {
      // Explicit, authored triage-quality scoring — whether the
      // candidate actually remediated all three independently-owned
      // consumers ("fully-recovered-all-three") or stopped after fixing
      // only a subset (the loudest pipeline, two of three, or the
      // producer-side shim alone with no consumer follow-up). Every
      // value is a literal rules.ts authors by hand, read generically by
      // the shared finalStringEquals measure.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: {
        type: "finalStringEquals",
        field: "diagnosisPath",
        value: "fully-recovered-all-three",
      },
      bands: [
        { atMost: 0, points: 70 },
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
        // Restarting Fraud Detection's pods without the shim/redeploy is
        // a wasted, plausible-but-insufficient action — penalized here
        // (the COST of the wrong action taken), independent of
        // dataIntegrity's own lower band for an incomplete diagnosisPath
        // (whether the right diagnosis was ultimately reached).
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 7 },
        { measure: "configurationChangeCount", atLeast: 6, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 9, subtractPoints: 10 },
      ],
    },
  ],
};
