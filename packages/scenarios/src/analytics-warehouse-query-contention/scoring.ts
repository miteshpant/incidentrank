import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Analytics Warehouse Query Contention's scoring configuration.
 *
 * CENTRAL JUDGMENT: workload prioritization / stakeholder tradeoff, not
 * warehouse capacity. dataIntegrity and reliability below are
 * repurposed (the generic scorer's penalties-mode convention already
 * used by every other invariant-gated scenario in this codebase) to
 * carry the two real business-invariant violations this scenario
 * defines: revoking ad-hoc access entirely (workloadTradeoffStatus=
 * "overcorrected") and leaving the SLA genuinely exposed with nothing
 * prioritizing the critical job (workloadTradeoffStatus="sla-exposed").
 * A separate, independent penalty on dataScienceLostWorkHoursCumulative
 * (via the PEAK-tracked numeric value) captures the hard-kill trap's
 * real, uncounted cost even on an attempt whose live state has since
 * moved on.
 *
 *   - dataIntegrity: penalties against workloadTradeoffStatus's closed
 *     enum. "overcorrected" (the access-revocation trap) loses the
 *     majority of this dimension — a real, named business-invariant
 *     violation, never "almost optimal" just because the SLA number
 *     looks perfect. "sla-exposed" (the fifo/uncapped baseline and the
 *     capacity-only-insufficient family) loses a real, substantial
 *     amount too, since the SLA itself is unprotected.
 *   - reliability: an independent gate on the SAME underlying judgment
 *     from the lost-work angle — penalizes any attempt where
 *     dataScienceLostWorkHoursCumulative's PEAK ever exceeded zero (the
 *     hard-kill trap), proven non-resetting by this scenario's test
 *     suite, plus a smaller, honest penalty for "sla-exposed" from this
 *     angle too (an unprotected SLA is also a reliability failure, not
 *     only a data-integrity one).
 *   - costEfficiency: costIncreaseRatio — genuinely first-class here:
 *     warehouseCapacityTier="scaled" is a real, continuous extra spend
 *     that by itself does not protect the SLA, while the two alternate
 *     strong paths (priority-queue, capped) protect the SLA at zero
 *     extra Warehouse spend (reportDeadlineCommunication's small
 *     proactive-notice cost is the only real spend difference between
 *     otherwise-equal safe paths).
 *   - operationalEfficiency: beyond the generic harmful/configuration-
 *     change penalties, an additional penalty against
 *     stakeholderCommunicationStatus="silent" while contention was ever
 *     active — the scenario's required "communicate the tradeoff rather
 *     than silently starving a stakeholder group" axis, scored
 *     separately from whether the SLA itself was protected.
 */
export const ANALYTICS_WAREHOUSE_QUERY_CONTENTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band thresholds tuned against this scenario's authored
      // timeline: a genuine ACCEPTABLE resolution (priority-queue or
      // capped alone, still draining) is reachable near
      // DRAIN_WINDOW_1_MS (~90-100s of elapsed recovery time), while the
      // fully-drained OPTIMAL terminal states require the full drain
      // window on top of sustained-contention onset (~360-400s). The
      // top band deliberately extends far enough to include BOTH —
      // mirroring Model Feature Freshness Degradation's identical
      // calibration note — so dataIntegrity/operationalEfficiency (not
      // recovery alone) are what separate ACCEPTABLE from OPTIMAL on
      // this axis; a still-draining acceptable checkpoint must never
      // outscore a fully-recovered optimal one purely because it was
      // read earlier.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 450, points: 300 },
        { atMost: 600, points: 200 },
        { atMost: 900, points: 120 },
        { atMost: 1_200, points: 60 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 200, points: 200 },
        { atMost: 600, points: 160 },
        { atMost: 1_400, points: 110 },
        { atMost: 2_800, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Primary business-invariant gate. "overcorrected" (ad-hoc access
      // fully revoked) loses the majority of this dimension — strictly
      // worse than merely not having fixed the SLA yet. "sla-exposed"
      // (SLA genuinely unprotected, ad-hoc access still open) loses a
      // real, substantial amount too, from a different angle than the
      // overcorrection.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "workloadTradeoffStatus", value: "overcorrected" },
          atLeast: 1,
          subtractPoints: 150,
        },
        {
          measure: { type: "finalStringEquals", field: "workloadTradeoffStatus", value: "sla-exposed" },
          atLeast: 1,
          subtractPoints: 110,
        },
        // A small, honest distinction between ACCEPTABLE (still
        // draining — a real prioritization/cap lever is engaged and
        // already working, but the pre-existing ad-hoc backlog has not
        // yet fully cleared) and OPTIMAL (fully recovered) — never
        // large enough to make a draining-but-safe state look anywhere
        // near as bad as an actual invariant violation, but enough that
        // a still-draining Finish never ties a fully-recovered one on
        // total score purely because recovery/revenue-loss happened to
        // round into the same top band at both checkpoints.
        {
          measure: { type: "finalStringEquals", field: "backlogStatus", value: "draining" },
          atLeast: 1,
          subtractPoints: 15,
        },
      ],
    },
    {
      // Independent gate from a second angle: penalizes the SAME
      // overcorrection violation again (a business-invariant violation
      // is also a reliability failure, not only a data-integrity one —
      // ad-hoc consumers now have zero access to a resource they
      // genuinely depend on) plus a smaller, honest "sla-exposed"
      // penalty from this angle too. dataScienceLostWorkHoursCumulative
      // is never scored directly as a number here (deliberately — this
      // dimension's string-based penalty already carries the judgment,
      // consistent with Cross-Region Replication Cost Explosion's
      // documented precedent of not double-scoring a peak-tracked
      // number the live-field penalty already captures).
      dimension: "reliability",
      maxPoints: 150,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "workloadTradeoffStatus", value: "overcorrected" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "workloadTradeoffStatus", value: "sla-exposed" },
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
        { atMost: 0.02, points: 85 },
        { atMost: 0.2, points: 60 },
        { atMost: 0.45, points: 30 },
        { points: 10 },
      ],
    },
    {
      // Generic harmful/configuration-change penalties PLUS the
      // scenario's required communication-maturity penalty: leaving
      // stakeholderCommunicationStatus="silent" while contention was
      // ever active is a real, avoidable gap, scored independently of
      // whether the SLA itself was protected.
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
        {
          measure: { type: "finalStringEquals", field: "stakeholderCommunicationStatus", value: "silent" },
          atLeast: 1,
          subtractPoints: 10,
        },
      ],
    },
  ],
};
