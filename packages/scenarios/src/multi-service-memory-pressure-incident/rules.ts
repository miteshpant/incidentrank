import type { ComponentHealth, Rule } from "@incidentrank/simulator";
import {
  AGGREGATION_CONCURRENCY_KEY,
  API_CONCURRENCY_KEY,
  DEPENDENCY_A_INSTANCE_COUNT_KEY,
  MAX_RESPONSE_SIZE_KEY,
  PARTIAL_RESPONSE_MODE_KEY,
  RESPONSE_FIELD_SET_MODE_KEY,
  CACHE_POLICY_KEY,
  WORKER_COUNT_KEY,
} from "./controls";

const healthyHealth: Record<string, ComponentHealth> = {
  clients: "healthy",
  gateway: "healthy",
  "api-service": "healthy",
  aggregator: "healthy",
  "dependency-a": "healthy",
  "dependency-b": "healthy",
  "dependency-c": "healthy",
};

const decoyOnlyCriticalHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "degraded",
  "api-service": "degraded",
  "dependency-a": "critical",
};

const allDegradedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "critical",
  "api-service": "degraded",
  "dependency-a": "critical",
  "dependency-b": "degraded",
  "dependency-c": "degraded",
};

const oomChurnHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "critical",
  "api-service": "critical",
  "dependency-a": "critical",
  "dependency-b": "critical",
  "dependency-c": "critical",
};

const decoyScaledTemporaryHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "degraded",
  "api-service": "degraded",
  "dependency-a": "degraded",
  "dependency-b": "degraded",
  "dependency-c": "degraded",
};

const decoyReaccumulatedHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "critical",
  "api-service": "degraded",
  "dependency-a": "degraded",
  "dependency-b": "critical",
  "dependency-c": "critical",
};

const decayingHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "degraded",
  "api-service": "healthy",
  "dependency-a": "degraded",
  "dependency-b": "healthy",
  "dependency-c": "healthy",
};

const truncationViolationHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "degraded",
  "api-service": "degraded",
  "dependency-a": "degraded",
};

const partialModeHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "degraded",
  "dependency-a": "degraded",
};

const cacheOnlyHealth: Record<string, ComponentHealth> = {
  ...healthyHealth,
  aggregator: "degraded",
  "api-service": "degraded",
  "dependency-a": "critical",
  "dependency-b": "degraded",
  "dependency-c": "degraded",
};

/**
 * Authored rule table for Multi-Service Memory Pressure Incident, ordered
 * most-specific-first. A payload/data-shape change widened what the
 * Aggregator pulls and holds from each of Dependency A, B, and C per
 * request. Dependency A — the component with the least heap headroom —
 * is the first to visibly GC-thrash, but it is a MISLEADING SYMPTOM: the
 * true root cause is upstream, at the Aggregator, which is now building
 * an oversized per-request aggregation object regardless of which
 * downstream dependency happens to be loudest.
 *
 * TWO GENUINE, STRUCTURALLY DIFFERENT ROOT-CAUSE FIXES exist (both
 * reshape what the Aggregator actually builds and holds, so both are
 * OPTIMAL once GC/heap decay has run its course):
 *   1. responseFieldSetMode = "reduced" — truncate the aggregation
 *      object to the correctness-bounded field set at the SOURCE,
 *      before it is ever built in full.
 *   2. aggregationConcurrency <= 10 — reduce how many oversized
 *      per-request objects exist in memory AT ONCE.
 *
 * REQUIRED TEMPTING PATH / PRESSURE-TRANSFER (phase6d.4.md section 14,
 * this scenario's named mechanism): scaling dependencyAInstanceCount (the
 * decoy, loudest-failing service) while the root cause remains
 * unaddressed gives real, measurable, TEMPORARY relief on Dependency A
 * specifically — but nothing about the Aggregator's oversized object
 * changed. Memory pressure both (a) PERSISTS — Dependency A's own
 * pressure re-accumulates once DECOY_SCALING_REACCUMULATION trigger
 * fires — and (b) TRANSFERS — Dependency B and C, never scaled, absorb a
 * larger relative share of the same unaddressed amplification and read
 * WORSE than they would have otherwise. See "decoy-scaled-temporary-
 * relief" and "decoy-scaled-pressure-reaccumulated" below.
 *
 * RECOVERY LAG (phase6d.4.md section 15, required): once a genuine fix
 * is active, GC pause time and memory utilization do not drop to
 * baseline on the same tick — they decay across DECAY_WINDOW_1/2/
 * FULLY_RECOVERED (see timed-events.ts), proven by
 * "root-cause-fixed-just-applied" / "-decaying-1" / "-decaying-2" /
 * "-fully-recovered" below.
 *
 * HISTORICAL DAMAGE MODEL (phase6d.4.md section 13): restartChurnCount
 * only ever increases once oomChurnOnset has fired while the root cause
 * remains unaddressed. The moment a real fix is applied, NO further
 * churn accrues — but restartChurnCount is never reset; it freezes at
 * whatever it last reached, mirroring Data Pipeline Freshness Collapse's
 * droppedEventCount pattern. See "root-cause-fixed-after-churn-scarred".
 *
 * CORRECTNESS-BOUNDED TRUNCATION TRAP: maxResponseSizeKb = "64kb" caps
 * the ALREADY-BUILT oversized response after the fact. It looks clean on
 * memory/latency, but it truncates past the explicit correctness bound —
 * customerEnrichmentCompletenessPct drops well below what the response
 * is contractually required to carry, and errorRatePct rises visibly.
 * This is checked FIRST among memory-pressure rules so it is never
 * confused with genuine relief, regardless of every other control.
 */
export const multiServiceMemoryPressureIncidentRules: Rule[] = [
  // ══════════════════════════════════════════════════════════════════
  // UNSAFE CORRECTNESS TRAP — checked first: wins regardless of every
  // other control, because a correctness violation is never acceptable
  // however healthy memory/latency metrics look.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "max-response-size-truncation-violation",
    when: {
      triggerEquals: { memoryPressureActive: true },
      controlEquals: { [MAX_RESPONSE_SIZE_KEY]: "64kb" },
    },
    incidentState: "truncation-correctness-violation",
    values: {
      aggregatorMemoryUtilizationPct: 48,
      dependencyAMemoryUtilizationPct: 55,
      dependencyBMemoryUtilizationPct: 42,
      dependencyCMemoryUtilizationPct: 40,
      apiServiceMemoryUtilizationPct: 40,
      gcPauseMsP99: 380,
      restartChurnCount: 0,
      responsePayloadSizeKb: 64,
      customerEnrichmentCompletenessPct: 38,
      errorRatePct: 26,
      aggregatorStatus: "warning",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "violated",
    },
    componentHealth: truncationViolationHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // HISTORICAL DAMAGE PROOF — checked BEFORE the generic clean-recovery
  // rules below so it is never shadowed by them: root cause fixed AFTER
  // oomChurnOnset already fired. restartChurnCount is carried forward
  // unchanged (it freezes, never resets), proving "root cause fixed !=
  // damage erased" even once current health is fully clean. Requiring
  // oomChurnOnset: true here (which the generic clean-recovery rules
  // below never check) is exactly what keeps this rule from ever
  // matching the clean timeline — it can ONLY match once churn has
  // actually occurred, honestly proving non-reset without overlapping
  // the clean recovery path.
  // ══════════════════════════════════════════════════════════════════
  {
    id: "root-cause-fixed-field-set-after-churn-scarred",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindowFullyRecoveredElapsed: true,
        oomChurnOnset: true,
      },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "reduced" },
    },
    incidentState: "recovered-but-churn-scarred",
    values: {
      aggregatorMemoryUtilizationPct: 25,
      dependencyAMemoryUtilizationPct: 23,
      dependencyBMemoryUtilizationPct: 20,
      dependencyCMemoryUtilizationPct: 20,
      apiServiceMemoryUtilizationPct: 22,
      gcPauseMsP99: 29,
      // Frozen at the value it last reached — never re-derived from a
      // formula, never reset once a fix is applied.
      restartChurnCount: 7,
      responsePayloadSizeKb: 36,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "normal",
      rootCauseHealth: "resolved",
      memoryPressureHealth: "clear",
      fleetIntegrityHealth: "churn-scarred",
      correctnessBoundHealth: "respected",
    },
    componentHealth: healthyHealth,
  },
  // Same historical-damage proof via the alternate root-cause fix
  // (aggregationConcurrency <= 10 instead of responseFieldSetMode).
  // Kept as a sibling rule rather than merged into one, since the two
  // fixes carry different responsePayloadSizeKb values (36 vs 95) that
  // must stay honest to whichever fix was actually applied.
  {
    id: "root-cause-fixed-concurrency-after-churn-scarred",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindowFullyRecoveredElapsed: true,
        oomChurnOnset: true,
      },
      controlAtMost: { [AGGREGATION_CONCURRENCY_KEY]: 10 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "recovered-but-churn-scarred-concurrency",
    values: {
      aggregatorMemoryUtilizationPct: 26,
      dependencyAMemoryUtilizationPct: 24,
      dependencyBMemoryUtilizationPct: 21,
      dependencyCMemoryUtilizationPct: 21,
      apiServiceMemoryUtilizationPct: 22,
      gcPauseMsP99: 31,
      restartChurnCount: 7,
      responsePayloadSizeKb: 95,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "normal",
      rootCauseHealth: "resolved",
      memoryPressureHealth: "clear",
      fleetIntegrityHealth: "churn-scarred",
      correctnessBoundHealth: "respected",
    },
    componentHealth: healthyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // OPTIMAL RECOVERY #1 — responseFieldSetMode fixed at the source,
  // with the full GC/heap decay window elapsed (and churn never
  // occurred — see the historical-damage rule immediately above, which
  // is checked first and will have already matched if oomChurnOnset
  // fired).
  // ══════════════════════════════════════════════════════════════════
  {
    id: "root-cause-fixed-field-set-fully-recovered",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindowFullyRecoveredElapsed: true,
        oomChurnOnset: false,
      },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "reduced" },
    },
    incidentState: "fully-recovered-field-set",
    values: {
      aggregatorMemoryUtilizationPct: 24,
      dependencyAMemoryUtilizationPct: 22,
      dependencyBMemoryUtilizationPct: 19,
      dependencyCMemoryUtilizationPct: 19,
      apiServiceMemoryUtilizationPct: 21,
      gcPauseMsP99: 28,
      restartChurnCount: 0,
      responsePayloadSizeKb: 36,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "normal",
      rootCauseHealth: "resolved",
      memoryPressureHealth: "clear",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: healthyHealth,
  },
  // ── OPTIMAL alternate strong path #2 — aggregationConcurrency
  // reduced instead, fully decayed. A structurally different fix
  // (fewer concurrent oversized objects, rather than smaller objects)
  // reaching the same safe bar.
  {
    id: "root-cause-fixed-concurrency-fully-recovered",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindowFullyRecoveredElapsed: true,
        oomChurnOnset: false,
      },
      controlAtMost: { [AGGREGATION_CONCURRENCY_KEY]: 10 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "fully-recovered-concurrency",
    values: {
      aggregatorMemoryUtilizationPct: 26,
      dependencyAMemoryUtilizationPct: 23,
      dependencyBMemoryUtilizationPct: 20,
      dependencyCMemoryUtilizationPct: 20,
      apiServiceMemoryUtilizationPct: 22,
      gcPauseMsP99: 30,
      restartChurnCount: 0,
      responsePayloadSizeKb: 95,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "normal",
      rootCauseHealth: "resolved",
      memoryPressureHealth: "clear",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: healthyHealth,
  },

  // ── RECOVERY LAG proof, field-set fix: decaying across windows 2,
  // 1, and "just applied" (tick zero) — never an instant drop.
  {
    id: "root-cause-fixed-field-set-decaying-2",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindow2Elapsed: true,
        decayWindowFullyRecoveredElapsed: false,
      },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "reduced" },
    },
    incidentState: "decaying-field-set-window2",
    values: {
      aggregatorMemoryUtilizationPct: 32,
      dependencyAMemoryUtilizationPct: 34,
      dependencyBMemoryUtilizationPct: 24,
      dependencyCMemoryUtilizationPct: 24,
      apiServiceMemoryUtilizationPct: 26,
      gcPauseMsP99: 70,
      restartChurnCount: 0,
      responsePayloadSizeKb: 36,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "addressed-pending-decay",
      memoryPressureHealth: "decaying",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decayingHealth,
  },
  {
    id: "root-cause-fixed-field-set-decaying-1",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindow1Elapsed: true,
        decayWindow2Elapsed: false,
      },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "reduced" },
    },
    incidentState: "decaying-field-set-window1",
    values: {
      aggregatorMemoryUtilizationPct: 40,
      dependencyAMemoryUtilizationPct: 46,
      dependencyBMemoryUtilizationPct: 29,
      dependencyCMemoryUtilizationPct: 29,
      apiServiceMemoryUtilizationPct: 32,
      gcPauseMsP99: 130,
      restartChurnCount: 0,
      responsePayloadSizeKb: 36,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "addressed-pending-decay",
      memoryPressureHealth: "decaying",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decayingHealth,
  },
  {
    id: "root-cause-fixed-field-set-just-applied",
    when: {
      triggerEquals: { memoryPressureActive: true, decayWindow1Elapsed: false },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "reduced" },
    },
    incidentState: "just-applied-field-set",
    values: {
      aggregatorMemoryUtilizationPct: 58,
      dependencyAMemoryUtilizationPct: 68,
      dependencyBMemoryUtilizationPct: 36,
      dependencyCMemoryUtilizationPct: 36,
      apiServiceMemoryUtilizationPct: 40,
      gcPauseMsP99: 240,
      restartChurnCount: 0,
      responsePayloadSizeKb: 36,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "addressed-pending-decay",
      memoryPressureHealth: "decaying",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decayingHealth,
  },

  // ── RECOVERY LAG proof, concurrency fix (alternate path), windows 2
  // and 1 — proves the lag applies regardless of which real fix was
  // chosen, not special-cased to the field-set lever.
  {
    id: "root-cause-fixed-concurrency-decaying-2",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindow2Elapsed: true,
        decayWindowFullyRecoveredElapsed: false,
      },
      controlAtMost: { [AGGREGATION_CONCURRENCY_KEY]: 10 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "decaying-concurrency-window2",
    values: {
      aggregatorMemoryUtilizationPct: 34,
      dependencyAMemoryUtilizationPct: 36,
      dependencyBMemoryUtilizationPct: 25,
      dependencyCMemoryUtilizationPct: 25,
      apiServiceMemoryUtilizationPct: 27,
      gcPauseMsP99: 75,
      restartChurnCount: 0,
      responsePayloadSizeKb: 95,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "addressed-pending-decay",
      memoryPressureHealth: "decaying",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decayingHealth,
  },
  {
    id: "root-cause-fixed-concurrency-decaying-1",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        decayWindow1Elapsed: true,
        decayWindow2Elapsed: false,
      },
      controlAtMost: { [AGGREGATION_CONCURRENCY_KEY]: 10 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "decaying-concurrency-window1",
    values: {
      aggregatorMemoryUtilizationPct: 42,
      dependencyAMemoryUtilizationPct: 48,
      dependencyBMemoryUtilizationPct: 30,
      dependencyCMemoryUtilizationPct: 30,
      apiServiceMemoryUtilizationPct: 33,
      gcPauseMsP99: 135,
      restartChurnCount: 0,
      responsePayloadSizeKb: 95,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "addressed-pending-decay",
      memoryPressureHealth: "decaying",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decayingHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // REQUIRED TEMPTING PATH / PRESSURE-TRANSFER — scaling the decoy
  // (Dependency A) while the root cause remains unaddressed.
  // ══════════════════════════════════════════════════════════════════

  // ── Temporary relief: scaled right after onset, before the
  // reaccumulation window. Dependency A's own numbers look genuinely
  // better than the unscaled baseline (more aggregate heap headroom),
  // but Dependency B and C are now visibly worse than THEIR unscaled
  // baseline too — pressure already transferring onto the dependencies
  // that were never scaled, even before Dependency A's own relief
  // fades.
  {
    id: "decoy-scaled-temporary-relief",
    when: {
      triggerEquals: {
        memoryPressureActive: true,
        dependencyAGcThrashing: true,
        decoyReaccumulationWindowElapsed: false,
      },
      controlAtLeast: { [DEPENDENCY_A_INSTANCE_COUNT_KEY]: 8 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "decoy-scaled-temporary-relief",
    values: {
      aggregatorMemoryUtilizationPct: 68,
      dependencyAMemoryUtilizationPct: 46,
      dependencyBMemoryUtilizationPct: 58,
      dependencyCMemoryUtilizationPct: 58,
      apiServiceMemoryUtilizationPct: 50,
      gcPauseMsP99: 90,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 2,
      aggregatorStatus: "warning",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decoyScaledTemporaryHealth,
  },
  // ── Pressure re-accumulated: once the reaccumulation window has
  // elapsed, Dependency A's own memory/GC pressure has climbed back up
  // despite the added instances, because the Aggregator's oversized
  // object was never addressed — the relief was never durable. Worse,
  // Dependency B and C (never scaled) are now critical, having
  // absorbed a larger relative share of the same unaddressed
  // amplification throughout.
  {
    id: "decoy-scaled-pressure-reaccumulated",
    when: {
      triggerEquals: { memoryPressureActive: true, decoyReaccumulationWindowElapsed: true },
      controlAtLeast: { [DEPENDENCY_A_INSTANCE_COUNT_KEY]: 8 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "decoy-scaled-pressure-reaccumulated",
    values: {
      aggregatorMemoryUtilizationPct: 82,
      dependencyAMemoryUtilizationPct: 64,
      dependencyBMemoryUtilizationPct: 88,
      dependencyCMemoryUtilizationPct: 88,
      apiServiceMemoryUtilizationPct: 60,
      gcPauseMsP99: 310,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 9,
      aggregatorStatus: "critical",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decoyReaccumulatedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // PARTIAL MITIGATIONS — real, visible, but not durable fixes.
  // ══════════════════════════════════════════════════════════════════

  // ── Partial response mode alone: the fleet stops waiting on (and
  // holding memory for) every dependency's full result before
  // responding, which genuinely protects against OOM/restart churn —
  // but the Aggregator still builds the full oversized object for
  // whichever dependencies DO respond in time, so memory pressure stays
  // elevated and the root cause is not fixed.
  {
    id: "partial-response-mode-protects-fleet-not-root-cause",
    when: {
      triggerEquals: { memoryPressureActive: true, dependencyAGcThrashing: true },
      controlEquals: {
        [PARTIAL_RESPONSE_MODE_KEY]: "enabled",
        [RESPONSE_FIELD_SET_MODE_KEY]: "full",
      },
      controlAtLeast: { [AGGREGATION_CONCURRENCY_KEY]: 25 },
    },
    incidentState: "partial-response-mode-active",
    values: {
      aggregatorMemoryUtilizationPct: 54,
      dependencyAMemoryUtilizationPct: 60,
      dependencyBMemoryUtilizationPct: 40,
      dependencyCMemoryUtilizationPct: 40,
      apiServiceMemoryUtilizationPct: 36,
      gcPauseMsP99: 160,
      restartChurnCount: 0,
      responsePayloadSizeKb: 410,
      customerEnrichmentCompletenessPct: 88,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: partialModeHealth,
  },

  // ── Partial relief: cache policy on alone. Repeat identical requests
  // are served from cache, giving real but incomplete relief — a cold
  // cache miss under live load still builds the full oversized
  // aggregation object.
  {
    id: "cache-policy-partial-relief",
    when: {
      triggerEquals: { memoryPressureActive: true, dependencyAGcThrashing: true },
      controlEquals: { [CACHE_POLICY_KEY]: "on", [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
      controlAtLeast: { [AGGREGATION_CONCURRENCY_KEY]: 25 },
    },
    incidentState: "cache-policy-partial-relief",
    values: {
      aggregatorMemoryUtilizationPct: 58,
      dependencyAMemoryUtilizationPct: 68,
      dependencyBMemoryUtilizationPct: 44,
      dependencyCMemoryUtilizationPct: 44,
      apiServiceMemoryUtilizationPct: 38,
      gcPauseMsP99: 190,
      restartChurnCount: 0,
      responsePayloadSizeKb: 470,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 1,
      aggregatorStatus: "warning",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: cacheOnlyHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // HARMFUL — scaling the wrong location, or feeding more demand into
  // an unfixed root cause.
  // ══════════════════════════════════════════════════════════════════

  // ── Harmful: Aggregator workerCount scaled up alone. This scales the
  // ROOT LOCATION itself without changing what each worker builds and
  // holds — more workers now each build the SAME oversized object
  // concurrently, so aggregate Aggregator memory pressure is WORSE than
  // the unscaled baseline, not better.
  {
    id: "worker-count-scaled-worsens-aggregator",
    when: {
      triggerEquals: { memoryPressureActive: true, dependencyAGcThrashing: true },
      controlAtLeast: { [WORKER_COUNT_KEY]: 32 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "worker-count-scaled-worsens-aggregator",
    values: {
      aggregatorMemoryUtilizationPct: 94,
      dependencyAMemoryUtilizationPct: 78,
      dependencyBMemoryUtilizationPct: 60,
      dependencyCMemoryUtilizationPct: 60,
      apiServiceMemoryUtilizationPct: 46,
      gcPauseMsP99: 520,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 7,
      aggregatorStatus: "critical",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: allDegradedHealth,
  },

  // ── Harmful: API concurrency scaled up alone. Admits more concurrent
  // inbound requests, each of which drives the SAME oversized
  // Aggregator work — more demand on an unfixed root cause, so pressure
  // across the Aggregator and all three dependencies is WORSE than the
  // unscaled (apiConcurrency: 100) baseline below, not better.
  {
    id: "api-concurrency-scaled-worsens-everything",
    when: {
      triggerEquals: { memoryPressureActive: true, dependencyAGcThrashing: true },
      controlAtLeast: { [API_CONCURRENCY_KEY]: 400 },
      controlEquals: { [RESPONSE_FIELD_SET_MODE_KEY]: "full" },
    },
    incidentState: "api-concurrency-scaled-worsens-everything",
    values: {
      aggregatorMemoryUtilizationPct: 80,
      dependencyAMemoryUtilizationPct: 90,
      dependencyBMemoryUtilizationPct: 58,
      dependencyCMemoryUtilizationPct: 58,
      apiServiceMemoryUtilizationPct: 64,
      gcPauseMsP99: 540,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 6,
      aggregatorStatus: "critical",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: allDegradedHealth,
  },

  // ══════════════════════════════════════════════════════════════════
  // BASELINE — no meaningful mitigation taken.
  // ══════════════════════════════════════════════════════════════════

  // ── OOM/restart churn active: unmitigated long enough for real
  // restart churn to begin. restartChurnCount climbs here and only
  // here (see rule above for the frozen post-fix value) — never
  // re-derived from a formula.
  {
    id: "oom-churn-active-unmitigated",
    when: { triggerEquals: { memoryPressureActive: true, oomChurnOnset: true } },
    incidentState: "oom-churn-active",
    values: {
      aggregatorMemoryUtilizationPct: 96,
      dependencyAMemoryUtilizationPct: 92,
      dependencyBMemoryUtilizationPct: 90,
      dependencyCMemoryUtilizationPct: 90,
      apiServiceMemoryUtilizationPct: 70,
      gcPauseMsP99: 1_600,
      restartChurnCount: 7,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 70,
      errorRatePct: 22,
      aggregatorStatus: "critical",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "churn-scarred",
      correctnessBoundHealth: "respected",
    },
    componentHealth: oomChurnHealth,
  },

  // ── Second wave: Dependency B and C now also visibly degraded —
  // proving the root cause was never Dependency-A-specific.
  {
    id: "unmitigated-spread-baseline",
    when: { triggerEquals: { memoryPressureActive: true, unmitigatedSpread: true } },
    incidentState: "unmitigated-spread",
    values: {
      aggregatorMemoryUtilizationPct: 88,
      dependencyAMemoryUtilizationPct: 85,
      dependencyBMemoryUtilizationPct: 74,
      dependencyCMemoryUtilizationPct: 74,
      apiServiceMemoryUtilizationPct: 62,
      gcPauseMsP99: 980,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 85,
      errorRatePct: 12,
      aggregatorStatus: "critical",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: allDegradedHealth,
  },

  // ── Baseline critical: Dependency A GC-thrashing, root cause
  // unaddressed, no meaningfully mitigating action taken.
  {
    id: "dependency-a-gc-thrashing-baseline",
    when: { triggerEquals: { memoryPressureActive: true, dependencyAGcThrashing: true } },
    incidentState: "dependency-a-gc-thrashing",
    values: {
      aggregatorMemoryUtilizationPct: 62,
      dependencyAMemoryUtilizationPct: 78,
      dependencyBMemoryUtilizationPct: 42,
      dependencyCMemoryUtilizationPct: 42,
      apiServiceMemoryUtilizationPct: 38,
      gcPauseMsP99: 410,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 3,
      aggregatorStatus: "warning",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: decoyOnlyCriticalHealth,
  },

  // ── Early warning: shape change shipped, Dependency A has not yet
  // started GC-thrashing. Memory utilization is visibly climbing across
  // the board, giving the candidate a legitimate early signal before
  // the decoy symptom lands.
  {
    id: "shape-change-pre-thrashing",
    when: { triggerEquals: { memoryPressureActive: true } },
    incidentState: "shape-change-shipped",
    values: {
      aggregatorMemoryUtilizationPct: 40,
      dependencyAMemoryUtilizationPct: 38,
      dependencyBMemoryUtilizationPct: 32,
      dependencyCMemoryUtilizationPct: 32,
      apiServiceMemoryUtilizationPct: 30,
      gcPauseMsP99: 90,
      restartChurnCount: 0,
      responsePayloadSizeKb: 480,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "warning",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: {
      ...healthyHealth,
      aggregator: "degraded",
      "dependency-a": "degraded",
      "dependency-b": "degraded",
      "dependency-c": "degraded",
    },
  },

  // ── Default/fallback: before the incident begins.
  {
    id: "healthy-default",
    when: {},
    incidentState: "healthy",
    values: {
      aggregatorMemoryUtilizationPct: 22,
      dependencyAMemoryUtilizationPct: 20,
      dependencyBMemoryUtilizationPct: 18,
      dependencyCMemoryUtilizationPct: 18,
      apiServiceMemoryUtilizationPct: 20,
      gcPauseMsP99: 25,
      restartChurnCount: 0,
      responsePayloadSizeKb: 40,
      customerEnrichmentCompletenessPct: 100,
      errorRatePct: 0,
      aggregatorStatus: "normal",
      rootCauseHealth: "unaddressed",
      memoryPressureHealth: "persisting",
      fleetIntegrityHealth: "never-churned",
      correctnessBoundHealth: "respected",
    },
    componentHealth: healthyHealth,
  },
];
