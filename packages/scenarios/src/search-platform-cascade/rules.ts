import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  API_CAPACITY_KEY,
  CACHE_KEY,
  FEATURE_STORE_USAGE_KEY,
  INDEX_TIMEOUT_MS_KEY,
  PARTIAL_RESULT_MODE_KEY,
  QUERY_CONCURRENCY_KEY,
  RANKING_INCLUSION_KEY,
  RANKING_TIMEOUT_MS_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  "search-api": "healthy",
  "query-coordinator": "healthy",
  "index-cluster-a": "healthy",
  "index-cluster-b": "healthy",
  "ranking-service": "healthy",
  "feature-store": "healthy",
};

const rankingDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "ranking-service": "degraded",
};

const coordinatorStressedHealth: Record<string, ComponentHealth> = {
  ...rankingDegradedHealth,
  "query-coordinator": "degraded",
  "search-api": "degraded",
};

const coordinatorCriticalHealth: Record<string, ComponentHealth> = {
  ...rankingDegradedHealth,
  "query-coordinator": "critical",
  "search-api": "critical",
  "index-cluster-a": "degraded",
  "index-cluster-b": "degraded",
  "feature-store": "critical",
};

const indexTimeoutClippingHealth: Record<string, ComponentHealth> = {
  ...rankingDegradedHealth,
  "query-coordinator": "critical",
  "search-api": "critical",
  "index-cluster-a": "critical",
  "index-cluster-b": "critical",
  "feature-store": "critical",
};

const rankingExcludedCoreIntactHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "ranking-service": "healthy",
};

const unsafeCorrectnessHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "query-coordinator": "degraded",
};

const retriggerHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  "query-coordinator": "critical",
  "search-api": "degraded",
  "index-cluster-a": "degraded",
  "index-cluster-b": "degraded",
  "feature-store": "degraded",
};

/**
 * Authored rule table for Search Platform Cascade, ordered
 * most-specific first.
 *
 * Business invariants (stated in the candidate briefing, see
 * search-platform-cascade.ts): basic search is business-critical and
 * must stay available; advanced ranking/re-ranking is optional during
 * an incident; search correctness must never be sacrificed by returning
 * stale/unrelated content outside the allowed bound; feature enrichment
 * may be degraded.
 *
 * Root mechanism: Ranking Service latency rises moderately
 * (rankingDegraded trigger). The Query Coordinator issues one combined
 * request per query that holds open connections to Index Cluster A,
 * Index Cluster B, AND the Feature Store until EVERY downstream call —
 * including the slow Ranking call — resolves or times out
 * (RANKING_TIMEOUT_MS_KEY, default 5000ms). This is NOT a fan-out
 * explosion (call COUNT never changes) and NOT a hard dependency
 * failure (Ranking is slow, never down) and NOT a misconfigured
 * end-to-end timeout BUDGET across a linear chain (there is no chain —
 * Index Cluster A/B and the Feature Store are three architecturally
 * unrelated siblings, not sequential hops) — it is one coordinator
 * holding one shared resource pool open longer because of ONE slow
 * sibling call, which simultaneously starves two unrelated resources.
 *
 * PRESSURE TRANSFER (phase6d.2.md, required, real authored values):
 * raising QUERY_CONCURRENCY_KEY and/or API_CAPACITY_KEY alone, while
 * Ranking is still fully in the path and still degraded, admits MORE
 * concurrent queries that will ALSO wait the long Ranking timeout —
 * directly multiplying indexClusterAConnections/indexClusterBConnections/
 * featureStoreQps rather than relieving anything. See
 * "scale-symptom-worsens-pressure" below: concurrency 400 + api 400
 * drives indexClusterAConnections from the unmitigated baseline's 240
 * up to 480, featureStoreQps from 3,400 up to 6,800, and
 * searchApiP99Ms from 3,900 up to 9,100 — a real, authored, measurable
 * worsening, not a cosmetic bump.
 *
 * INDEX TIMEOUT MISUSE (compounds the trap, does not cause it): while
 * the pressure-transfer trap above is active, tightening
 * INDEX_TIMEOUT_MS_KEY to 1,200ms makes things WORSE still, not better
 * — see "index-timeout-tightened-during-pressure-transfer" below.
 * Index Cluster A/B's own serving latency never rises (35-37ms
 * throughout; the index clusters are never the bottleneck), but at
 * trap-level concurrency queries queue for a free Coordinator
 * connection slot before the index call is even issued, so the tighter
 * per-call budget clips otherwise-recoverable queries into outright
 * failures (basicSearchSuccessRatePercent 54, down from the untightened
 * trap's 61) while indexClusterA/BConnections paradoxically read LOWER
 * (410 vs. 480) because clipped calls release their connection early.
 * Outside the pressure-transfer trap, this control remains the neutral
 * verification lever its own doc-comment in controls.ts describes.
 *

 * HISTORICAL DAMAGE (phase6d.2.md section 9):
 * staleOrUnrelatedResultsServedCount only increments while
 * PARTIAL_RESULT_MODE_KEY="on" AND CACHE_KEY="off" AND ranking is out
 * of the path (excluded or still-included-but-timed-out) SIMULTANEOUSLY
 * — the Coordinator, told to return partial results fast with no
 * bounded cache to serve from, falls back to stale/unrelated content
 * outside the allowed freshness bound. Once this combination has been
 * active, EVERY later, safer rule state in this table freezes the
 * counter at the value it last reached — it is never written back down
 * by any rule, regardless of what the candidate fixes afterward. Only
 * engaging CACHE_KEY="on" (a bounded, freshness-respecting fallback)
 * halts further growth; it never un-serves what was already returned.
 *
 * RECOVERY LAG (phase6d.2.md, required): Index Cluster A/B connections
 * and Feature Store QPS do not snap back the instant Ranking is
 * excluded — "degraded-quality-safe-draining" below shows them still
 * elevated (draining, not yet baseline) until coordinatorDrainWindowElapsed
 * fires (timed-events.ts, 2 minutes after ranking degrades). Only
 * "restored-safely-after-drain" reaches true baseline numbers.
 *
 * SEQUENCING (phase6d.2.md section 11, genuinely present, not
 * manufactured): restoring RANKING_INCLUSION_KEY back to "included"
 * BEFORE coordinatorDrainWindowElapsed has fired re-spikes
 * coordinatorInFlightRequests and both index-cluster connection counts
 * — see "restore-too-early-retrigger" below — because the Coordinator
 * immediately resumes holding connections open across the still-warm
 * concurrency load for the Ranking wait, exactly reproducing the
 * original mechanism. Restoring AFTER the drain window, with
 * concurrency/api capacity still at safe levels, is the only path to
 * "restored-safely-after-drain".
 */
export const searchPlatformCascadeRules: Rule[] = [
  // ── UNSAFE, strictly worse than the pressure-transfer trap alone:
  // the candidate has raised both query concurrency and API capacity
  // (the pressure-transfer trap, see "scale-symptom-worsens-pressure"
  // below) AND tightened INDEX_TIMEOUT_MS_KEY to 1,200ms. Index Cluster
  // A/B's own serving latency never changes (still 35-37ms, see
  // controls.ts) -- the index clusters are not slower. But at this
  // concurrency level the Coordinator's connection pool is saturated
  // enough that queries now genuinely queue, waiting for a free
  // connection slot, BEFORE the index call is even issued. A tighter
  // per-call timeout measured from issuance clips some of those
  // queued-but-otherwise-fine calls before the index cluster ever gets
  // to answer them, turning a slow-but-recoverable query into an
  // outright failure. This is a real, distinct, measurably worse
  // outcome than "scale-symptom-worsens-pressure" alone:
  // basicSearchSuccessRatePercent drops further (54 vs. 61) because of
  // genuine new failures, and indexClusterA/BConnections register LOWER
  // than the untightened trap (410 vs. 480) because clipped calls
  // release their held connection early instead of holding it open for
  // the full wait -- a real, distinguishable signature, not the same
  // number reused. Tightening the index timeout here never helps:
  // the index clusters were never the bottleneck.
  {
    id: "index-timeout-tightened-during-pressure-transfer",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: { [RANKING_INCLUSION_KEY]: "included", [INDEX_TIMEOUT_MS_KEY]: 1_200 },
      controlAtLeast: { [QUERY_CONCURRENCY_KEY]: 400, [API_CAPACITY_KEY]: 400 },
    },
    incidentState: "index-timeout-tightened-during-pressure-transfer",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 520,
      indexClusterAConnections: 410,
      indexClusterBConnections: 410,
      featureStoreQps: 6_800,
      searchApiP99Ms: 8_200,
      indexClusterALatencyMs: 36,
      indexClusterBLatencyMs: 37,
      basicSearchSuccessRatePercent: 54,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "critical",
      responsePathMode: "scale-the-symptom-index-clipped",
    },
    componentHealth: indexTimeoutClippingHealth,
  },

  // ── UNSAFE, the named tempting/harmful path (pressure transfer):
  // Ranking is still fully in the path and still degraded, but the
  // candidate has raised BOTH query concurrency and API capacity to
  // try to "push through" the latency. More concurrent queries now
  // wait the same long Ranking timeout, so index-cluster connections
  // and Feature Store QPS get MEASURABLY WORSE, not better, and Search
  // API p99 latency explodes further.
  {
    id: "scale-symptom-worsens-pressure",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: { [RANKING_INCLUSION_KEY]: "included" },
      controlAtLeast: { [QUERY_CONCURRENCY_KEY]: 400, [API_CAPACITY_KEY]: 400 },
    },
    incidentState: "scale-symptom-worsens-pressure",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 520,
      indexClusterAConnections: 480,
      indexClusterBConnections: 480,
      featureStoreQps: 6_800,
      searchApiP99Ms: 9_100,
      indexClusterALatencyMs: 36,
      indexClusterBLatencyMs: 37,
      basicSearchSuccessRatePercent: 61,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "critical",
      responsePathMode: "scale-the-symptom",
    },
    componentHealth: coordinatorCriticalHealth,
  },

  // ── UNSAFE, scale-the-symptom with only ONE lever raised: still
  // worse than baseline because more queries are admitted into the
  // same slow wait, but less catastrophic than raising both at once.
  {
    id: "concurrency-raised-alone-worsens-pressure",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: { [RANKING_INCLUSION_KEY]: "included" },
      controlAtLeast: { [QUERY_CONCURRENCY_KEY]: 200 },
    },
    incidentState: "concurrency-raised-alone-worsens-pressure",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 310,
      indexClusterAConnections: 340,
      indexClusterBConnections: 340,
      featureStoreQps: 4_800,
      searchApiP99Ms: 5_600,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 36,
      basicSearchSuccessRatePercent: 78,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "critical",
      responsePathMode: "scale-the-symptom",
    },
    componentHealth: coordinatorStressedHealth,
  },

  // ── UNSAFE, the correctness-violating path (historical damage
  // mechanism): ranking excluded from the path AND partial-result mode
  // is on, but the cache that would otherwise provide a bounded,
  // freshness-respecting fallback is OFF. Availability metrics look
  // excellent (fast responses, high basicSearchSuccessRatePercent) —
  // but staleOrUnrelatedResultsServedCount is genuinely nonzero and
  // actively climbing, a direct violation of "search correctness must
  // not be sacrificed ... outside the allowed bound" that a candidate
  // watching only latency/success-rate would never notice.
  {
    id: "unsafe-partial-results-no-cache-bound",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: {
        [RANKING_INCLUSION_KEY]: "excluded",
        [PARTIAL_RESULT_MODE_KEY]: "on",
        [CACHE_KEY]: "off",
      },
    },
    incidentState: "unsafe-partial-results-no-cache-bound",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 90,
      indexClusterAConnections: 150,
      indexClusterBConnections: 150,
      featureStoreQps: 200,
      searchApiP99Ms: 260,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 35,
      basicSearchSuccessRatePercent: 99.5,
      rankedResponsePercent: 0,
      staleOrUnrelatedResultsServedCount: 340,
      coordinatorPressureStatus: "warning",
      responsePathMode: "unsafe-partial-results",
    },
    componentHealth: unsafeCorrectnessHealth,
  },

  // ── SEQUENCING, unsafe retrigger: the candidate had genuinely put the
  // system into the safe degraded posture (partial-result mode on, the
  // bounded cache engaged) and then restored ranking to "included"
  // before coordinatorDrainWindowElapsed had fired. This is
  // distinguished from the untouched baseline (where partial-result
  // mode is still its "off" default) by partialResultMode/CACHE_KEY
  // still carrying the degraded-mode configuration the candidate set —
  // a real signature of "was just in degraded mode, just flipped
  // ranking back," not merely "never touched anything." Even with the
  // historical staleness counter correctly frozen at whatever value it
  // last reached (never reset), restoring ranking too early re-exposes
  // the Coordinator's connection pool to the same long Ranking wait
  // under concurrency that never actually drained, immediately
  // re-spiking index-cluster connections and Feature Store QPS. This is
  // the genuine, authored sequencing trap: the SAME final control value
  // (ranking "included") is safe once drained and unsafe before.
  {
    id: "restore-too-early-retrigger",
    when: {
      triggerEquals: { rankingDegraded: true, coordinatorDrainWindowElapsed: false },
      controlEquals: {
        [RANKING_INCLUSION_KEY]: "included",
        [PARTIAL_RESULT_MODE_KEY]: "on",
        [CACHE_KEY]: "on",
      },
    },
    incidentState: "restore-too-early-retrigger",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 260,
      indexClusterAConnections: 300,
      indexClusterBConnections: 300,
      featureStoreQps: 3_900,
      searchApiP99Ms: 4_800,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 36,
      basicSearchSuccessRatePercent: 82,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 340,
      coordinatorPressureStatus: "critical",
      responsePathMode: "restored-too-early",
    },
    componentHealth: retriggerHealth,
  },

  // ── ACCEPTABLE, safe degraded state, still draining: ranking
  // excluded, feature-store usage reduced/off, partial-result mode on
  // WITH the bounded cache engaged (never produces stale/unrelated
  // content outside the bound), but coordinatorDrainWindowElapsed has
  // not fired yet — index-cluster connections and Feature Store QPS
  // are genuinely lower than baseline/trap but still draining down
  // toward true baseline, a real, observable recovery-lag window. This
  // is the scenario's legitimate bounded-but-not-fully-healthy terminal
  // state: new damage has stopped (staleOrUnrelatedResultsServedCount
  // frozen at 0 on this path, never incremented), correctness is fully
  // protected, basic search is fully healthy, and the only thing not
  // yet at 100% is advanced ranking — which the briefing states is
  // explicitly optional during an incident.
  {
    id: "degraded-quality-safe-draining",
    when: {
      triggerEquals: { rankingDegraded: true, coordinatorDrainWindowElapsed: false },
      controlEquals: {
        [RANKING_INCLUSION_KEY]: "excluded",
        [PARTIAL_RESULT_MODE_KEY]: "on",
        [CACHE_KEY]: "on",
      },
    },
    incidentState: "degraded-quality-safe-draining",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 55,
      indexClusterAConnections: 95,
      indexClusterBConnections: 95,
      featureStoreQps: 120,
      searchApiP99Ms: 240,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 35,
      basicSearchSuccessRatePercent: 99.7,
      rankedResponsePercent: 0,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "warning",
      responsePathMode: "degraded-quality-safe",
    },
    componentHealth: rankingExcludedCoreIntactHealth,
  },

  // ── Guards the no-action exploit: every control still sitting
  // EXACTLY at its untouched incident default, even after
  // coordinatorDrainWindowElapsed has fired. Waiting alone never fixes
  // anything in this scenario — Ranking Service latency does not
  // self-heal, and the Coordinator never had its dependency on Ranking
  // reduced, so there is nothing to have drained. This rule pins the
  // FULL default control tuple (strictly more specific than
  // "restored-safely-after-drain" below, which only pins three of the
  // eight controls), so it wins the first-match ordering whenever the
  // candidate has taken no meaningfully mitigating action at all,
  // regardless of how much wall-clock time has elapsed. Without this
  // rule, a zero-action attempt would eventually satisfy
  // "restored-safely-after-drain" by coincidence of shared default
  // values — exactly the no-instant-Finish-exploit violation this
  // batch's immediate-Finish audit exists to catch.
  {
    id: "untouched-defaults-no-drain-possible",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: {
        [RANKING_INCLUSION_KEY]: "included",
        [FEATURE_STORE_USAGE_KEY]: "full",
        [PARTIAL_RESULT_MODE_KEY]: "off",
        [CACHE_KEY]: "off",
        [RANKING_TIMEOUT_MS_KEY]: 5_000,
      },
      controlAtMost: { [QUERY_CONCURRENCY_KEY]: 100, [API_CAPACITY_KEY]: 100 },
    },
    incidentState: "baseline-unmitigated",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 240,
      indexClusterAConnections: 240,
      indexClusterBConnections: 240,
      featureStoreQps: 3_400,
      searchApiP99Ms: 3_900,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 36,
      basicSearchSuccessRatePercent: 84,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "critical",
      responsePathMode: "full-ranking",
    },
    componentHealth: coordinatorStressedHealth,
  },

  // ── OPTIMAL: ranking selectively restored AFTER
  // coordinatorDrainWindowElapsed has genuinely fired, with
  // concurrency/api capacity left at safe levels. Index-cluster
  // connections, Feature Store QPS, and Search API p99 all return to
  // true pre-incident baseline, ranking is live again, and the
  // correctness counter remains at whatever it was already frozen at
  // (0 on the safe path that never used the unsafe combination) — never
  // magically reset, simply never having grown in the first place on
  // this path. Reached only via genuine prior mitigation (the candidate
  // must have deviated from the untouched default tuple at some point
  // during the incident — the rule immediately above this one claims
  // the pure zero-action case).
  {
    id: "restored-safely-after-drain",
    when: {
      triggerEquals: { rankingDegraded: true, coordinatorDrainWindowElapsed: true },
      controlEquals: { [RANKING_INCLUSION_KEY]: "included" },
      controlAtMost: { [QUERY_CONCURRENCY_KEY]: 100, [API_CAPACITY_KEY]: 100 },
    },
    incidentState: "restored-safely-after-drain",
    values: {
      rankingLatencyMs: 90,
      coordinatorInFlightRequests: 40,
      indexClusterAConnections: 60,
      indexClusterBConnections: 60,
      featureStoreQps: 800,
      searchApiP99Ms: 220,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 35,
      basicSearchSuccessRatePercent: 99.8,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "normal",
      responsePathMode: "restored-safely",
    },
    componentHealth: healthyHealth,
  },

  // ── OPTIMAL-adjacent, remains permanently degraded by choice: ranking
  // excluded, feature-store off, partial-result mode on + cache on, AND
  // the drain window has elapsed — the fully drained, fully safe,
  // deliberately-degraded steady state. This is a LEGITIMATE end state,
  // not merely a step toward restoring ranking: the business invariant
  // explicitly states ranking is optional, so a candidate who stops
  // here with search fully healthy and correctness fully protected has
  // made a complete, correct decision.
  {
    id: "degraded-quality-safe-drained",
    when: {
      triggerEquals: { rankingDegraded: true, coordinatorDrainWindowElapsed: true },
      controlEquals: {
        [RANKING_INCLUSION_KEY]: "excluded",
        [PARTIAL_RESULT_MODE_KEY]: "on",
        [CACHE_KEY]: "on",
      },
    },
    incidentState: "degraded-quality-safe-drained",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 40,
      indexClusterAConnections: 60,
      indexClusterBConnections: 60,
      featureStoreQps: 20,
      searchApiP99Ms: 150,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 35,
      basicSearchSuccessRatePercent: 99.9,
      rankedResponsePercent: 0,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "normal",
      responsePathMode: "degraded-quality-safe",
    },
    componentHealth: rankingExcludedCoreIntactHealth,
  },

  // ── Partial relief, still at risk: ranking timeout shortened
  // (prevents the WORST of the hold-open behavior) but ranking is still
  // included in the path and partial-result mode is off, so the
  // Coordinator still waits (just a bounded, shorter amount) on every
  // query. A real, visible improvement over the unmitigated baseline,
  // but index-cluster connections and Feature Store QPS remain
  // elevated because every query still fully blocks on SOME ranking
  // wait before responding.
  {
    id: "timeout-shortened-alone-partial-relief",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: { [RANKING_INCLUSION_KEY]: "included" },
      controlAtMost: { [RANKING_TIMEOUT_MS_KEY]: 400 },
    },
    incidentState: "timeout-shortened-alone-partial-relief",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 110,
      indexClusterAConnections: 140,
      indexClusterBConnections: 140,
      featureStoreQps: 2_100,
      searchApiP99Ms: 1_600,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 35,
      basicSearchSuccessRatePercent: 93,
      rankedResponsePercent: 55,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "warning",
      responsePathMode: "full-ranking",
    },
    componentHealth: rankingDegradedHealth,
  },

  // ── Partial relief: feature-store usage reduced while ranking stays
  // included. Cuts Feature Store QPS meaningfully (less per-query
  // enrichment work), but does nothing about the Coordinator holding
  // index-cluster connections open for the Ranking wait itself — index
  // pressure stays at the unmitigated baseline level.
  {
    id: "feature-store-reduced-alone-partial-relief",
    when: {
      triggerEquals: { rankingDegraded: true },
      controlEquals: {
        [RANKING_INCLUSION_KEY]: "included",
        [FEATURE_STORE_USAGE_KEY]: "reduced",
      },
    },
    incidentState: "feature-store-reduced-alone-partial-relief",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 240,
      indexClusterAConnections: 240,
      indexClusterBConnections: 240,
      featureStoreQps: 1_700,
      searchApiP99Ms: 3_900,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 36,
      basicSearchSuccessRatePercent: 89,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "critical",
      responsePathMode: "full-ranking",
    },
    componentHealth: rankingDegradedHealth,
  },

  // ── Baseline critical: Ranking Service has degraded and the
  // candidate has taken no meaningfully mitigating action yet. Every
  // query still fully waits on Ranking's slow response, holding
  // index-cluster connections and Feature Store calls open for the
  // extended duration across the default concurrency load.
  {
    id: "baseline-unmitigated",
    when: { triggerEquals: { rankingDegraded: true } },
    incidentState: "baseline-unmitigated",
    values: {
      rankingLatencyMs: 650,
      coordinatorInFlightRequests: 240,
      indexClusterAConnections: 240,
      indexClusterBConnections: 240,
      featureStoreQps: 3_400,
      searchApiP99Ms: 3_900,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 36,
      basicSearchSuccessRatePercent: 84,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "critical",
      responsePathMode: "full-ranking",
    },
    componentHealth: coordinatorStressedHealth,
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      rankingLatencyMs: 90,
      coordinatorInFlightRequests: 40,
      indexClusterAConnections: 60,
      indexClusterBConnections: 60,
      featureStoreQps: 800,
      searchApiP99Ms: 220,
      indexClusterALatencyMs: 35,
      indexClusterBLatencyMs: 35,
      basicSearchSuccessRatePercent: 99.8,
      rankedResponsePercent: 100,
      staleOrUnrelatedResultsServedCount: 0,
      coordinatorPressureStatus: "normal",
      responsePathMode: "full-ranking",
    },
    componentHealth: healthyHealth,
  },
];
