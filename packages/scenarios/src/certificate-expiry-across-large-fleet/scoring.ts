import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Certificate Expiry Across Large Fleet's scoring configuration.
 *
 * All six dimensions carry real signal here (unlike Data Retention
 * Policy Misconfiguration's deliberately-secondary availability axis):
 * this IS an availability-relevant scenario — a missed deadline or a
 * premature-revocation gap genuinely rejects connections — so recovery/
 * customerImpact are not artificially widened. dataIntegrity instead
 * carries the SEQUENCING/VALIDATION-CORRECTNESS gate specifically: a
 * live connection-rejecting condition (expiry outage, premature gap, OR
 * validation bypass) is penalized steeply regardless of the raw
 * success-rate number, which the bypass trap deliberately keeps
 * looking healthy.
 *
 *   - dataIntegrity (the PRIMARY correctness gate): penalizes
 *     fleetConnectionStatus != "nominal" via finalStringNotEquals —
 *     catches expiry-outage, premature-gap-outage, AND
 *     validation-bypassed uniformly, since all three represent "the
 *     fleet is not genuinely, safely serving every connection right
 *     now," regardless of why. Reaching ANY terminal OPTIMAL/ACCEPTABLE
 *     rule in rules.ts already requires fleetConnectionStatus ===
 *     "nominal" (see successCondition/acceptableCondition in
 *     revenue-and-cost.ts), and no rule reachable while the
 *     validation-bypass trap is engaged ever authors "nominal" — so
 *     this single penalty is sufficient to make the bypass trap unable
 *     to reach either completion tier, without needing a second,
 *     separately-tracked non-resetting security-status field (unlike
 *     the numeric peak/historical-damage fields, finalStringValues
 *     reflects only the FINAL state, not a peak, so a "bypass ever
 *     happened" string marker would require a dedicated persistent
 *     trigger this engine's rule-matching has no mechanism to set from
 *     a control change — see the scenario's completion report for why
 *     this was deliberately not attempted). The cumulative bypassed-
 *     connection COUNT is still tracked permanently and non-resettingly
 *     via numericWatchFields' trackPeak (definition.ts) and asserted by
 *     a dedicated test — it simply is not read directly by the generic
 *     scorer, exactly like Service-to-Service Credential Rotation
 *     Failure's cumulativeUnauthenticatedCallCount.
 *   - reliability: criticalTimeRatio against fleetConnectionSeverity —
 *     time spent with a live connection-rejecting OR bypass condition,
 *     steep bands.
 *   - customerImpact: revenueLossUsd — real discrimination here (this
 *     IS an availability-relevant incident).
 *   - recovery: recoveryTimeSeconds — real discrimination: a candidate
 *     who rotates early (well before T-1h) finishes with a much lower
 *     recoveryTimeSeconds than one who waits until the deadline is
 *     nearly missed.
 *   - costEfficiency: costIncreaseRatio — the real, modest ongoing cost
 *     of running the overlap window + Legacy bridge. Baseline cost is
 *     NOT inflated (unlike Cross-Region Replication Cost Explosion's
 *     documented engine limitation), so this discriminates honestly:
 *     candidates who never need Legacy's bridge (critical-first +
 *     modern-first without ever touching legacyCompatibilityBridge)
 *     never pay it; a candidate who leaves the overlap window /
 *     Legacy bridge open LONGER than necessary pays proportionally
 *     more.
 *   - operationalEfficiency: harmfulChangeCount/configurationChangeCount
 *     — standard, generic.
 */
export const CERTIFICATE_EXPIRY_ACROSS_LARGE_FLEET_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 400, points: 300 },
        { atMost: 650, points: 260 },
        { atMost: 900, points: 210 },
        { atMost: 1_200, points: 150 },
        { points: 80 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 100, points: 200 },
        { atMost: 400, points: 165 },
        { atMost: 1_000, points: 110 },
        { atMost: 2_000, points: 50 },
        { points: 10 },
      ],
    },
    {
      // PRIMARY correctness gate. See module doc comment: the generic
      // "not nominal" penalty catches every unsafe family uniformly —
      // expiry outage, premature-revocation gap, and validation bypass
      // all fail this identical gate, none of them reachable as
      // OPTIMAL/ACCEPTABLE.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "fleetConnectionStatus", value: "nominal" },
          atLeast: 1,
          subtractPoints: 150,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.05, points: 150 },
        { atMost: 0.15, points: 100 },
        { atMost: 0.3, points: 55 },
        { atMost: 0.5, points: 25 },
        { points: 5 },
      ],
    },
    {
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.05, points: 75 },
        { atMost: 0.1, points: 50 },
        { atMost: 0.2, points: 25 },
        { points: 10 },
      ],
    },
    {
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 10, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 15, subtractPoints: 10 },
      ],
    },
  ],
};
