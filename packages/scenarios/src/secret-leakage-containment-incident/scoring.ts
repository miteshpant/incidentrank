import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Secret Leakage Containment Incident's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * phase-6e-strategy-spec.md section 11's explicit security requirement):
 * a path where the exposed credential was ever left fully trusted must
 * score materially worse than every other non-optimal path, even
 * though that same path shows PERFECT availability metrics in the
 * entire scenario (see rules.ts's fully-trusted-* family —
 * applicationRequestSuccessRate/externalIntegrationSuccessRate stay at
 * their healthy baseline throughout). The generic scorer's literal
 * "dataIntegrity" measure always returns 0 (score.ts's
 * measureDimension), so this dimension uses `penalties` mode against
 * credentialContainmentStatus's closed string enum — the same
 * technique Identity Platform Degradation and Authorization Policy
 * Rollout Failure use for their own correctness dimensions.
 *
 * reliability gates primarily on auditReviewStatus === "reviewed" (the
 * genuine full-audit marker) together with a dedicated, separate
 * penalty for the broad-immediate-revocation trap's self-inflicted
 * availability breakage — isolating "did this attempt ever create an
 * avoidable outage" from ordinary recovery speed, exactly mirroring
 * Identity Platform Degradation's isolated pressure-transfer penalty.
 */
export const SECRET_LEAKAGE_CONTAINMENT_INCIDENT_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds are deliberately tuned against this scenario's
      // real authored timeline (timed-events.ts): the fastest a
      // genuine ACCEPTABLE-tier Finish can be sustained-eligible is
      // ~30-50s after incident start (monitored + active monitoring,
      // held for the 20s sustain window), while
      // COHORT_B_MIGRATION_WINDOW_MS is 7 minutes after exposure is
      // identified, so the fastest a genuine OPTIMAL-tier Finish can
      // be sustained-eligible is ~420 + 20 (sustain) = ~440s. The top
      // band comfortably includes this, mirroring Authorization Policy
      // Rollout Failure's identical calibration reasoning for its own
      // real, non-skippable cache-convergence wait.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 60, points: 300 },
        { atMost: 250, points: 280 },
        { atMost: 460, points: 260 },
        { atMost: 700, points: 140 },
        { points: 40 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 100, points: 200 },
        { atMost: 500, points: 150 },
        { atMost: 2_000, points: 90 },
        { atMost: 6_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Primary security/correctness gate. A path where
      // credentialContainmentStatus has ever read "trusted" (after
      // exposure was identified) or "broad-revoked-unsequenced" loses
      // the vast majority of this dimension's points — deliberately
      // set well below even the "monitored"/"staged-rotation" baseline
      // penalty, since a real, cumulative continued-trust exposure (or
      // a real, self-inflicted unsequenced outage) is strictly worse
      // than simply not having fully contained the incident yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "credentialContainmentStatus", value: "monitored" },
          atLeast: 1,
          subtractPoints: 60,
        },
        {
          measure: { type: "finalStringEquals", field: "credentialContainmentStatus", value: "staged-rotation" },
          atLeast: 1,
          subtractPoints: 30,
        },
        {
          measure: { type: "finalStringEquals", field: "credentialContainmentStatus", value: "trusted" },
          atLeast: 1,
          subtractPoints: 185,
        },
        {
          measure: {
            type: "finalStringEquals",
            field: "credentialContainmentStatus",
            value: "broad-revoked-unsequenced",
          },
          atLeast: 1,
          subtractPoints: 150,
        },
      ],
    },
    {
      // Primary gate: auditReviewStatus === "reviewed" is the ONLY
      // value meaning "the historical audit trail has been fully
      // reconstructed" — the genuine full-audit marker reachable
      // exclusively via fully-contained-reviewed in rules.ts. Every
      // other value loses a large, deliberate amount of credit here —
      // NOT because an unreviewed-but-contained posture is unsafe
      // (dataIntegrity above barely penalizes "monitored"/
      // "staged-rotation" states, and does not penalize
      // fully-contained-unreviewed at all, since containment itself IS
      // safe), but because reliability specifically measures "is the
      // whole incident, as a system of record, actually fully closed
      // out" and an unreviewed audit trail by definition is not. A
      // SEPARATE, isolated penalty catches the broad-immediate-
      // revocation trap's self-inflicted availability breakage
      // directly off externalIntegrationStatus, so that trap loses
      // real credit here too, independent of the auditReviewStatus
      // gate (which it also fails, since it never reaches
      // "reviewed").
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "auditReviewStatus", value: "reviewed" },
          atLeast: 1,
          subtractPoints: 95,
        },
        {
          measure: { type: "finalStringEquals", field: "externalIntegrationStatus", value: "critical" },
          atLeast: 1,
          subtractPoints: 55,
        },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.3, points: 80 },
        { atMost: 0.6, points: 55 },
        { atMost: 1.0, points: 25 },
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
