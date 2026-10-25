import type { AuthoredScoringConfig } from "../authoring/schema";

/**
 * Backfill Overwhelms Production's scoring configuration.
 *
 * dataIntegrity and operationalEfficiency are the two dimensions that
 * must do the real work here (per phase6d.4.md section 16/17's
 * score-sanity audit). As with Data Pipeline Freshness Collapse, the
 * generic scorer's literal "dataIntegrity" measure always returns 0 and
 * there is no numeric-threshold penalty measure (only the two
 * string-state forms, finalStringEquals/NotEquals), so both dimensions
 * use `penalties` mode against productionDatabaseStatus's closed string
 * enum.
 *
 * SCORE-SANITY AUDIT (section 17, addressed explicitly, with real
 * numbers from this scenario's own test suite):
 *   - harmful < baseline: the unmanaged-high-concurrency path scores
 *     335 vs. the zero-action baseline's 370 (dataIntegrity, cost, and
 *     operationalEfficiency all read worse) — see
 *     backfill-overwhelms-production.test.ts's "harmful path... scores
 *     WORSE than the zero-action baseline".
 *   - correctness-violating path heavily penalized: any nonzero
 *     skippedRowCount routes productionDatabaseStatus to
 *     "integrity-violated", which alone loses 180 of 200 dataIntegrity
 *     points (plus the separate 40-point incomplete-handback penalty
 *     below, since an integrity-violated path is never complete-honest
 *     either) — it can never look "almost optimal."
 *   - acceptable does not dominate optimal: a genuine tension exists
 *     here because "acceptable" (e.g. paused-fully-stable) Finishes
 *     FASTER and at LOWER infra cost than "optimal" (fully-resumed-
 *     complete runs ~870s longer to honestly drain the backlog) — a
 *     real, honest fact about their different revenueLossUsd/cost
 *     numbers that recovery-time/customerImpact/costEfficiency alone
 *     would score in acceptable's favor (870 vs 875, i.e. noise-level,
 *     without the explicit incomplete-handback penalty below). Both
 *     dataIntegrity and operationalEfficiency carry a dedicated
 *     finalStringNotEquals("productionDatabaseStatus","complete-honest")
 *     penalty (40 and 50 points respectively) specifically so that
 *     permanently/indefinitely NOT finishing the deadline-bound backfill
 *     cannot out-score genuinely finishing it, per the business
 *     invariant "the migration deadline genuinely matters" — without
 *     this, acceptable scores 960 vs. optimal's 805, a real reversal
 *     this scenario must not ship with. With it: optimal 875 >
 *     acceptable 870.
 *   - zero-action baseline is not suspiciously high: baseline-sustained-
 *     contention scores 0 on both recovery and reliability (unresolved
 *     terminal overrides) and only mid-band on customerImpact —
 *     total 370.
 *   - alternate strategies score per tradeoffs: medium-concurrency-
 *     protected and off-peak-scheduling both reach full dataIntegrity
 *     credit (genuinely safe) but share the same incomplete-handback
 *     penalty as any other non-complete-honest state, scoring according
 *     to their real, distinct tradeoffs rather than being decoys.
 *   - historical damage cannot improperly restore a near-perfect score:
 *     skip-mark-complete-scarred-live-safe has pristine CURRENT health
 *     (lockWait=15, requestSuccessRate=99.8) but skippedRowCount=4,500
 *     is still nonzero, so productionDatabaseStatus stays
 *     "integrity-violated" and dataIntegrity still loses the
 *     overwhelming majority of its points (score of 355 total, with
 *     dataIntegrity capped at 20) even though every other live signal
 *     looks perfect.
 */
export const BACKFILL_OVERWHELMS_PRODUCTION_SCORING: AuthoredScoringConfig = {
  dimensions: [
    {
      // Band widths calibrated to this scenario's authored timeline:
      // the fastest genuine OPTIMAL (fully-resumed-complete) requires
      // the longest resume-drain window on top of the full recovery
      // window — recoveryTimeSeconds ~1,460-1,500s. The acceptable
      // tier's fastest finish (off-peak scheduling, or paused-fully-
      // stable) lands much earlier (~50-590s). The top band
      // deliberately covers BOTH — recovery time alone does not
      // penalize a candidate for seeing a full, honest completion
      // through rather than handing back early; the real
      // differentiation between "gave up early" and "finished the
      // job" is operationalEfficiency's incomplete-handback penalty
      // below, per this file's score-sanity audit.
      dimension: "recovery",
      maxPoints: 300,
      measure: "recoveryTimeSeconds",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 1_600, points: 300 },
        { atMost: 2_200, points: 230 },
        { atMost: 2_800, points: 170 },
        { atMost: 3_400, points: 110 },
        { points: 30 },
      ],
    },
    {
      dimension: "customerImpact",
      maxPoints: 200,
      measure: "revenueLossUsd",
      bands: [
        { atMost: 300, points: 200 },
        { atMost: 800, points: 160 },
        { atMost: 1_800, points: 110 },
        { atMost: 3_500, points: 60 },
        { points: 10 },
      ],
    },
    {
      // Penalties mode on productionDatabaseStatus's closed string
      // enum. "contending" loses real credit (production safety was
      // never actually achieved). "integrity-violated" loses the
      // overwhelming majority of credit, however healthy every other
      // metric reads — this is the dimension that must never let
      // skip-mark-complete look "almost optimal." "protected"/
      // "safely-resumed" (genuinely safe, zero skipped rows, but the
      // historical backlog is not yet honestly, fully migrated) take a
      // small, real penalty here too — an unfinished historical
      // migration is itself a data-completeness gap, not only an
      // operational one, and this is what keeps a permanently-paused
      // handback from scoring identically to full honest completion on
      // this dimension (see this file's score-sanity audit note).
      dimension: "dataIntegrity",
      maxPoints: 200,
      penalties: [
        {
          measure: { type: "finalStringNotEquals", field: "productionDatabaseStatus", value: "complete-honest" },
          atLeast: 1,
          subtractPoints: 40,
        },
        {
          measure: { type: "finalStringEquals", field: "productionDatabaseStatus", value: "contending" },
          atLeast: 1,
          subtractPoints: 90,
        },
        {
          measure: { type: "finalStringEquals", field: "productionDatabaseStatus", value: "integrity-violated" },
          atLeast: 1,
          subtractPoints: 180,
        },
      ],
    },
    {
      dimension: "reliability",
      maxPoints: 150,
      measure: "criticalTimeRatio",
      terminalOverrides: { failed: 0, unresolved: 0 },
      bands: [
        { atMost: 0.1, points: 150 },
        { atMost: 0.25, points: 115 },
        { atMost: 0.45, points: 80 },
        { atMost: 0.65, points: 45 },
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
        { atMost: 0.6, points: 55 },
        { atMost: 1.2, points: 25 },
        { points: 10 },
      ],
    },
    {
      // In addition to the usual harmful/configuration-change
      // penalties, this dimension also penalizes handing the incident
      // back WITHOUT the backfill genuinely, honestly completed
      // (productionDatabaseStatus != "complete-honest") — this is what
      // keeps the business invariant "the migration deadline genuinely
      // matters" from being scoring-invisible. A bounded, paused/
      // safely-resumed-but-unfinished handback is still genuinely safe
      // (full dataIntegrity/reliability credit) and a legitimate
      // ACCEPTABLE tier, but it is deliberately NOT allowed to
      // out-score full honest completion purely because it finished
      // "faster" by giving up on the deadline — see score-sanity audit
      // note in this file's module doc comment.
      dimension: "operationalEfficiency",
      maxPoints: 50,
      penalties: [
        { measure: "harmfulChangeCount", atLeast: 1, subtractPoints: 15 },
        { measure: "harmfulChangeCount", atLeast: 2, subtractPoints: 35 },
        { measure: "configurationChangeCount", atLeast: 8, subtractPoints: 5 },
        { measure: "configurationChangeCount", atLeast: 12, subtractPoints: 10 },
        {
          measure: { type: "finalStringNotEquals", field: "productionDatabaseStatus", value: "complete-honest" },
          atLeast: 1,
          subtractPoints: 50,
        },
      ],
    },
  ],
};
