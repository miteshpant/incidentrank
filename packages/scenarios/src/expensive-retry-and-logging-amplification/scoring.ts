import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Expensive Retry and Logging Amplification's scoring configuration.
 *
 * dataIntegrity is the dimension that must do the real work here (per
 * the batch's binding requirement 4): a path where auditLogIntegrityStatus
 * has ever read "blind-window" must score materially worse than every
 * other non-optimal path, even though that same path shows the BEST raw
 * cost numbers and the SAME availability metrics as the OPTIMAL state
 * (see rules.ts's audit-logging-off-* family — requestSuccessRate sits
 * at 99.7-99.8 in exactly these states, indistinguishable from the safe
 * paths). The generic scorer's literal "dataIntegrity" measure always
 * returns 0 (score.ts's measureDimension), so this dimension uses
 * `penalties` mode against auditLogIntegrityStatus's closed string enum
 * — the same technique Privilege Escalation via Stale Authorization
 * Cache uses for its own correctness dimension.
 *
 * costEfficiency is the dimension that distinguishes the two alternate
 * strong paths and the combined optimal path from each other and from
 * the safe-but-wasteful acceptable tier, via `costIncreaseRatio` against
 * infrastructureCost's small, real per-lever cost deltas (revenue-and-
 * cost.ts). The LARGE headline cost story (dependency/logging/telemetry
 * spend) is carried honestly by the final `costOverrunPercent` state
 * value itself — visible to the candidate, gating success/acceptable —
 * rather than being folded into this dimension's own measure, since
 * AuthoredScoringMeasure has no generic "read this arbitrary state
 * field as a ratio" measure. This dimension still differs meaningfully
 * between safe paths because of the real, distinct infra-cost deltas
 * each lever combination carries (metadata-only logging costs less than
 * full-payload; tiered retention and low-sample telemetry cost a little
 * more in pipeline tooling) — never a decorative 10-point variation.
 *
 * reliability penalizes the audit-off trap again (a live correctness
 * violation is a reliability failure too, not merely a data-integrity
 * one) and separately penalizes the retryCount=0 overreach's measurable
 * requestSuccessRate regression via criticalTimeRatio's natural
 * sensitivity to totalTimeInDegradedMs — operationalEfficiency's
 * harmfulChangeCount penalty (from action-classifications.ts's acc_2
 * and acc_6) is the primary place that overreach and the audit trap are
 * independently counted.
 */
export const EXPENSIVE_RETRY_AND_LOGGING_AMPLIFICATION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds tuned against this scenario's real authored
      // timeline (timed-events.ts): the fastest a genuine ACCEPTABLE-tier
      // Finish can be sustained-eligible is shortly after
      // DEPLOY_REGRESSION_DETECTED_MS (loggingLevel stepped to "standard"
      // immediately, held for the 30s sustain window) — roughly 45-60s
      // after incident start — while COST_SETTLING_FULLY_DONE_MS (90s
      // offset from SUSTAINED_UNADDRESSED_MS, itself 240s after onset)
      // anchors the fastest genuine OPTIMAL-tier Finish at roughly
      // 15_000 + 240_000 + 90_000 + 30_000(sustain) = 375s. Acceptable's
      // fastest reachable band (<=90 -> 300) and optimal's fastest
      // reachable band (<=450 -> 280) are a deliberately small gap —
      // this dimension rewards genuine recovery speed honestly for
      // whichever tier a candidate reaches, and does not by itself try
      // to make optimal "win" on recovery alone. The dataIntegrity/
      // costEfficiency dimensions below carry the real weight of making
      // optimal's TOTAL exceed acceptable's TOTAL despite acceptable's
      // legitimate recovery-speed advantage.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 90, points: 300 },
        { atMost: 300, points: 280 },
        { atMost: 450, points: 270 },
        { atMost: 700, points: 140 },
        { points: 40 },
      ],
    },
    {
      // This incident never causes revenue loss (revenue-and-cost.ts's
      // revenueLossRatePerMinute is 0 everywhere) — every reachable path
      // scores full customerImpact credit, by design. The real judgment
      // this scenario tests lives in the other five dimensions.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 400, points: 200 },
        { atMost: 1_200, points: 150 },
        { atMost: 3_000, points: 90 },
        { atMost: 7_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Primary audit-correctness gate. A path where
      // auditLogIntegrityStatus has ever read "blind-window" loses the
      // vast majority of this dimension's points — deliberately set
      // well below even the plain "unaddressed" baseline penalty, since
      // a real, cumulative audit-blind-window violation is strictly
      // worse than simply not having reduced cost yet.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "costPosture", value: "unaddressed" },
          atLeast: 1,
          subtractPoints: 70,
        },
        {
          measure: { type: "finalStringEquals", field: "costPosture", value: "retry-amplification-reduced" },
          atLeast: 1,
          subtractPoints: 20,
        },
        {
          measure: { type: "finalStringEquals", field: "costPosture", value: "telemetry-noise-reduced" },
          atLeast: 1,
          subtractPoints: 20,
        },
        {
          measure: { type: "finalStringEquals", field: "auditLogIntegrityStatus", value: "blind-window" },
          atLeast: 1,
          subtractPoints: 185,
        },
      ],
    },
    {
      // Gates on operationalDebugSignalPercent staying fully sufficient
      // AND auditLogIntegrityStatus staying intact — reliability here
      // specifically measures "is the system, as a system, still
      // genuinely observable and safe," not merely "is cost reduced."
      // criticalTimeRatio is avoided for the same reason Privilege
      // Escalation via Stale Authorization Cache avoids it on its own
      // optimal-vs-acceptable gate: its denominator collapses for any
      // fast acceptable-tier Finish and fails to discriminate tiers.
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "auditLogIntegrityStatus", value: "intact" },
          atLeast: 1,
          subtractPoints: 130,
        },
        {
          measure: { type: "finalStringEquals", field: "costPosture", value: "unaddressed" },
          atLeast: 1,
          subtractPoints: 20,
        },
      ],
    },
    {
      // The real cost-efficiency judgment axis (binding requirement 1):
      // costIncreaseRatio against infrastructureCost's real per-lever
      // deltas (revenue-and-cost.ts) meaningfully distinguishes the two
      // alternate strong paths, the combined optimal path, and the
      // safe-but-wasteful acceptable tier from each other and from the
      // unaddressed baseline — never a decorative 10-point variation.
      dimension: "costEfficiency",
      maxPoints: 100,
      measure: "costIncreaseRatio",
      bands: [
        { atMost: 0, points: 100 },
        { atMost: 0.1, points: 80 },
        { atMost: 0.25, points: 55 },
        { atMost: 0.5, points: 25 },
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
