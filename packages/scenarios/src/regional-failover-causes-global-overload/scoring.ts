import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Regional Failover Causes Global Overload's scoring configuration.
 *
 * This scenario has no ledger/correctness divergence concept -- the real
 * "integrity" risk here is business-critical traffic silently being
 * dropped (regionACriticalTrafficDroppedPct) while availability
 * dashboards elsewhere look fine, and/or a previously-healthy region
 * being driven into failure. Following the same generic-string-state
 * pattern as Network Partition's ledgerSafetyMechanism, this scenario
 * authors `containmentMechanism` (metrics.ts/rules.ts) recording HOW
 * (or whether) the failover was safely contained -- see metrics.ts for
 * the full five-value doc comment ("uncontained" /
 * "capacity-managed-partial" / "capacity-managed-full" /
 * "restored-safely" / "retriggered").
 *
 * dataIntegrity treats "restored-safely" and "capacity-managed-full" as
 * equally full-credit: both genuinely never dropped critical traffic and
 * never put Region B/C at second-region risk, whether or not the
 * incident has fully wound down yet. "capacity-managed-partial" loses
 * real credit for the still-missing protection layer; "uncontained" and
 * "retriggered" lose the most, since both mean a previously-healthy
 * region was actually driven toward failure. The generic scorer's
 * `penalties` mode has no boolean-AND measure, so this is expressed as
 * independent single-value penalties per containmentMechanism value
 * (score.ts's applyPenalties stacks them additively) rather than as a
 * single two-value-equals band.
 */
export const REGIONAL_FAILOVER_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 120, points: 300 },
        { atMost: 210, points: 250 },
        { atMost: 300, points: 190 },
        { atMost: 420, points: 130 },
        { atMost: 600, points: 70 },
        { points: 20 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 150, points: 200 },
        { atMost: 400, points: 160 },
        { atMost: 900, points: 110 },
        { atMost: 1_600, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Full marks (200) for either durable-correct outcome --
      // "restored-safely" (the complete recovery) or
      // "capacity-managed-full" (fully protected and zero second-region
      // risk during the active incident, even with Region A still
      // intentionally offline): both genuinely never dropped critical
      // traffic and never risked a second region. "capacity-managed-
      // partial" (one protection tier still missing) loses a real,
      // meaningful amount of credit -- real stress is being carried
      // somewhere even though nothing has actually failed. "uncontained"
      // (the untouched baseline/harmful trap) and "retriggered" (the
      // recovery-sequencing failure) lose the most: in both, a
      // previously-healthy region was genuinely driven toward failure.
      // Penalties stack additively per phase6dsupport's generic scorer
      // (score.ts's applyPenalties): "partial" alone costs 100;
      // "uncontained"/"retriggered" alone cost 170 -- authored as two
      // independent single-value penalties so a state that is neither
      // "restored-safely" nor "capacity-managed-full" always loses
      // credit, without needing a boolean-AND measure the generic
      // scorer does not support.
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringEquals", field: "containmentMechanism", value: "capacity-managed-partial" },
          atLeast: 1,
          subtractPoints: 100,
        },
        {
          measure: { type: "finalStringEquals", field: "containmentMechanism", value: "uncontained" },
          atLeast: 1,
          subtractPoints: 170,
        },
        {
          measure: { type: "finalStringEquals", field: "containmentMechanism", value: "retriggered" },
          atLeast: 1,
          subtractPoints: 170,
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
        { measure: "configurationChangeCount", atLeast: 7, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 10, subtractPoints: 10 },
      ],
    },
  ],
};
