import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Hot Shard + Replica Lag + Failover Risk's scoring configuration.
 *
 * The real correctness signal this scenario models is
 * shard2StrandedAcknowledgedWriteCount (rules.ts) -- the direct,
 * authored evidence of acknowledged writes left stranded by an unsafe
 * failover -- which successCondition/acceptableCondition already gate
 * on directly. That raw count cannot be banded meaningfully by the
 * generic scorer's fixed numeric measures across every reachable
 * state (zero for most paths, but the exact value varies for the
 * unsafe/reconciling states depending on how long they were sustained
 * before Finish), so, following Multi-Region Payment Platform
 * Degradation's ledgerAuthorityMechanism / Consistency vs Availability
 * Incident's balanceSafetyMechanism precedent, this scenario carries a
 * generic string-state field -- shard2FailoverSafety -- that records
 * HOW Shard 2's write authority is currently being protected, not
 * merely a raw count:
 *
 *   "safe"             -- no failover ever happened while lag was
 *                           unsafe; either no failover occurred at
 *                           all, or it happened only after the real
 *                           drain window. The durable, correct choice.
 *   "unsafe-promotion" -- a failover was executed while replica lag
 *                           exceeded the safe threshold. This value
 *                           NEVER reverts to "safe" later in the same
 *                           attempt, even once reconciliation starts
 *                           draining the stranded-write backlog --
 *                           mirroring the historical-damage model's
 *                           "the mistake happened" is permanent even
 *                           as its consequences are bounded/reconciled.
 *
 * A single finalStringEquals measure bands on "safe" directly: full
 * marks only when the promotion itself was never unsafe. Every
 * "unsafe-promotion" value -- whether actively climbing, actively
 * reconciling, or long since fixed at the configuration level -- lands
 * in the lowest band, since the historical loss already happened and
 * reconciliation only bounds/drains it, never erases that it occurred.
 * No scenario-specific scorer code.
 */
export const HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Deliberately wide top band: this scenario's genuine OPTIMAL
      // path structurally requires waiting out the real elapsed
      // replica catch-up window (phase6d.2.md's mandatory recovery-lag
      // requirement) before Finish-eligibility is reached, whereas the
      // ACCEPTABLE tier can legitimately be reached much sooner (it
      // only requires containment to be in effect, not full drain). A
      // narrow recovery-time band would reward the faster, less-
      // complete acceptable tier over the slower, fully-correct
      // optimal tier on this dimension alone -- so both the
      // acceptable-reachable time (~20s post-incident) and the
      // optimal-reachable time (~200s, bounded by the authored
      // 3-minute drain window) land in the same top band, and the
      // real discrimination between tiers is carried by
      // customerImpact/dataIntegrity instead, matching Multi-Region
      // Payment Platform Degradation's precedent.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 210, points: 300 },
        { atMost: 320, points: 230 },
        { atMost: 480, points: 160 },
        { atMost: 700, points: 100 },
        { atMost: 1_000, points: 50 },
        { points: 20 },
      ],
    },
    {
      // Same reasoning as recovery's band: the optimal path's revenue
      // loss (accrued across its longer, structurally-required drain
      // window) and the acceptable path's revenue loss (accrued
      // across its much shorter containment-only window) both land in
      // this top band, so customerImpact does not penalize optimal
      // for the real elapsed time its correctness guarantee requires.
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 500, points: 200 },
        { atMost: 1_200, points: 160 },
        { atMost: 3_000, points: 120 },
        { atMost: 7_000, points: 70 },
        { atMost: 15_000, points: 40 },
        { points: 10 },
      ],
    },
    {
      // Generic string-state measure: full marks only when
      // shard2FailoverSafety === "safe" (no unsafe promotion ever
      // happened); the lowest band for "unsafe-promotion", regardless
      // of how actively it is being reconciled or how healthy other
      // metrics currently read.
      dimension: "dataIntegrity",
      maxPoints: 200,
      measure: { type: "finalStringEquals", field: "shard2FailoverSafety", value: "safe" },
      bands: [
        { atMost: 0, points: 30 },
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
        { atMost: 0.1, points: 80 },
        { atMost: 0.3, points: 55 },
        { atMost: 0.6, points: 25 },
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
