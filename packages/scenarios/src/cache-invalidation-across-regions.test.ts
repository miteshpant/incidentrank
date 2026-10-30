import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { cacheInvalidationAcrossRegions } from "./cache-invalidation-across-regions";
import {
  EU_INVALIDATION_REPLAY_MODE_KEY,
  GLOBAL_CACHE_BYPASS_KEY,
  ORIGIN_CONCURRENCY_KEY,
  REFRESH_CONCURRENCY_KEY,
  REGIONAL_INVALIDATOR_ISOLATION_KEY,
  STALE_WHILE_REVALIDATE_KEY,
  US_CACHE_MODE_KEY,
  US_TTL_SECONDS_KEY,
  cacheInvalidationAcrossRegionsSimulation,
} from "./cache-invalidation-across-regions/definition";
import { cacheInvalidationAcrossRegionsCandidateUI } from "./cache-invalidation-across-regions/candidate-ui";
import { CACHE_INVALIDATION_ACROSS_REGIONS_SCORING } from "./cache-invalidation-across-regions/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  INCIDENT_ONSET_MS,
  RECOVERY_WINDOW_1_MS,
  RECOVERY_WINDOW_2_MS,
  RECOVERY_WINDOW_FULL_MS,
  SUSTAINED_DESYNC_MS,
} from "./cache-invalidation-across-regions/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(cacheInvalidationAcrossRegionsSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += cacheInvalidationAcrossRegionsSimulation.tickMs
  ) {
    let action: CandidateAction | null = null;

    if (actionIndex < actions.length && actions[actionIndex]!.atMs <= timeMs) {
      const pending = actions[actionIndex]!;
      actionCounter += 1;
      action = {
        id: `action-${actionCounter}`,
        timestampMs: timeMs,
        controlKey: pending.controlKey,
        value: pending.value,
      };
      actionIndex += 1;
    }

    const result = simulate(
      cacheInvalidationAcrossRegionsSimulation,
      state,
      action,
      cacheInvalidationAcrossRegionsSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function scoringInputsFromState(state: ReturnType<typeof runScenario>) {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: null,
    failedAtMs: state.failedAtMs,
    totalTimeInCriticalMs: state.customerImpact.totalTimeInCriticalMs,
    totalTimeInDegradedMs: state.customerImpact.totalTimeInDegradedMs,
    revenueLossUsd: state.customerImpact.revenueLossUsd,
    peakSeverityRank: state.peaks.peakSeverityRank,
    numberOfConfigurationChanges: state.numberOfConfigurationChanges,
    numberOfHarmfulChanges: state.numberOfHarmfulChanges,
    numberOfBeneficialChanges: state.numberOfBeneficialChanges,
    initialMonthlyInfrastructureCostUsd: cacheInvalidationAcrossRegionsSimulation.infrastructureCost.baselineMonthlyUsd,
    finalMonthlyInfrastructureCostUsd: state.cost.currentMonthlyCostUsd,
    peakMonthlyInfrastructureCostUsd: state.peaks.peakMonthlyCostUsd,
    finalNumericValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "number"),
    ) as Record<string, number>,
    peakNumericValues: state.peaks.peakValues,
    finalStringValues: Object.fromEntries(
      Object.entries(state.values).filter(([, v]) => typeof v === "string"),
    ) as Record<string, string>,
  };
}

// Safe sequence: isolate EU's invalidator first, then stop EU's storm
// via deduplication, then bypass US for immediate freshness.
const SAFE_SEQUENCE_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_DESYNC_MS + 1_000, controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY, value: true },
  { atMs: SUSTAINED_DESYNC_MS + 2_000, controlKey: EU_INVALIDATION_REPLAY_MODE_KEY, value: "deduplicated" },
  { atMs: SUSTAINED_DESYNC_MS + 3_000, controlKey: US_CACHE_MODE_KEY, value: "bypass" },
];

const SWR_SEQUENCE_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_DESYNC_MS + 1_000, controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY, value: true },
  { atMs: SUSTAINED_DESYNC_MS + 2_000, controlKey: EU_INVALIDATION_REPLAY_MODE_KEY, value: "deduplicated" },
  { atMs: SUSTAINED_DESYNC_MS + 3_000, controlKey: STALE_WHILE_REVALIDATE_KEY, value: true },
];

describe("Cache Invalidation Across Regions", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(cacheInvalidationAcrossRegions.isFree).toBe(false);
      expect(cacheInvalidationAcrossRegions.library?.category).toBe("Caching");
      expect(cacheInvalidationAcrossRegions.library?.tags.length).toBeGreaterThan(0);
      expect(cacheInvalidationAcrossRegions.library?.skills.length).toBeGreaterThan(0);
      expect(cacheInvalidationAcrossRegions.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CACHE_INVALIDATION_ACROSS_REGIONS_SCORING.dimensions.map((d) => d.dimension);
      expect(dims.sort()).toEqual(
        [
          "recovery",
          "customerImpact",
          "dataIntegrity",
          "reliability",
          "costEfficiency",
          "operationalEfficiency",
        ].sort(),
      );
      const totalMax = CACHE_INVALIDATION_ACROSS_REGIONS_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(cacheInvalidationAcrossRegionsCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(cacheInvalidationAcrossRegionsCandidateUI.controls.length).toBe(8);
      expect(cacheInvalidationAcrossRegionsCandidateUI.components.length).toBe(6);
    });

    it("the architecture has exactly 6 nodes and 9 edges matching the spec", () => {
      expect(cacheInvalidationAcrossRegionsSimulation.architecture.nodes.length).toBe(6);
      expect(cacheInvalidationAcrossRegionsSimulation.architecture.edges.length).toBe(9);
    });

    it("the briefing explicitly states all five business invariants", () => {
      expect(cacheInvalidationAcrossRegions.description).toMatch(/freshness bound/i);
      expect(cacheInvalidationAcrossRegions.description).toMatch(/bounded stale-read window may be acceptable/i);
      expect(cacheInvalidationAcrossRegions.description).toMatch(/Origin Store's capacity must be protected/i);
      expect(cacheInvalidationAcrossRegions.description).toMatch(/regional isolation is preferable to global origin collapse/i);
      expect(cacheInvalidationAcrossRegions.description).toMatch(/invalidation replay must not create unbounded revalidation pressure/i);
    });

    it("100% of meaningful action classifications carry feedback", () => {
      for (const rule of cacheInvalidationAcrossRegionsSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control key is exercised by at least one action classification rule", () => {
      const classifiedKeys = new Set(
        cacheInvalidationAcrossRegionsSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of cacheInvalidationAcrossRegionsSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(cacheInvalidationAcrossRegionsSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.staleServesPastFreshnessBoundCount).toBe(0);
      expect(state.values.invalidationSystemStatus).toBe("fully-recovered");
    });

    it("incident onset triggers asymmetric per-region symptoms while Global API stays healthy", () => {
      const state = runScenario(INCIDENT_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(INCIDENT_ONSET_MS);
      expect(state.values.globalApiSuccessRatePct).toBeGreaterThanOrEqual(97);
      expect(state.values.usFreshnessStatus).toBe("critical");
      expect(state.values.euInvalidationStormStatus).toBe("critical");
      expect(state.values.apacFreshnessStatus).toBe("normal");
    });

    it("baseline (no action) accrues real historical stale-serve damage while the storm continues", () => {
      const state = runScenario(INCIDENT_ONSET_MS + 5_000);
      expect(state.transitions.incidentState).toBe("baseline-desync");
      expect(state.values.staleServesPastFreshnessBoundCount).toBeGreaterThan(0);
      expect(state.values.euRevalidationStormRatePerMin as number).toBeGreaterThan(0);
    });

    it("leaving the desync active long enough compounds into materially larger historical damage (sustained, and EU's storm now also contaminates APAC when unisolated)", () => {
      const early = runScenario(INCIDENT_ONSET_MS + 5_000);
      const sustained = runScenario(SUSTAINED_DESYNC_MS + 5_000);
      expect(sustained.transitions.incidentState).toBe("eu-storm-contagion-unisolated");
      expect(sustained.values.staleServesPastFreshnessBoundCount as number).toBeGreaterThan(
        early.values.staleServesPastFreshnessBoundCount as number,
      );
    });

    describe("Required pressure-transfer mechanism: global bypass overloads Origin worse than targeted bypass", () => {
      it("global bypass creates materially worse Origin overload than targeted US-only bypass at the same trigger window", () => {
        const globalBypass = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
        ]);
        const targetedBypass = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: US_CACHE_MODE_KEY, value: "bypass" },
        ]);
        expect(globalBypass.transitions.incidentState).toBe("global-bypass-origin-overload");
        expect(targetedBypass.transitions.incidentState).toBe("us-targeted-bypass-eu-storming");
        expect(globalBypass.values.originRequestsPerSec as number).toBeGreaterThan(
          targetedBypass.values.originRequestsPerSec as number,
        );
        expect(globalBypass.values.originLatencyMs as number).toBeGreaterThan(
          targetedBypass.values.originLatencyMs as number,
        );
        expect(globalBypass.values.originStatus).toBe("critical");
        expect(targetedBypass.values.originStatus).not.toBe("critical");
      });

      it("global bypass also beats the unmitigated baseline on Origin load, proving it is a real regression not merely 'no better'", () => {
        const baseline = runScenario(INCIDENT_ONSET_MS + 10_000);
        const globalBypass = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
        ]);
        expect(globalBypass.values.originRequestsPerSec as number).toBeGreaterThan(
          baseline.values.originRequestsPerSec as number,
        );
      });

      it("the global-bypass trap is never Finish-eligible", () => {
        const state = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
        ]);
        const eligibility = evaluateCompletionEligibility(cacheInvalidationAcrossRegionsSimulation, state);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("compounding refresh concurrency on top of global bypass makes Origin overload worse still", () => {
        const globalBypassAlone = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
        ]);
        const compounded = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
          { atMs: INCIDENT_ONSET_MS + 2_000, controlKey: REFRESH_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(compounded.values.originRequestsPerSec as number).toBeGreaterThan(
          globalBypassAlone.values.originRequestsPerSec as number,
        );
      });
    });

    describe("Tempting unsafe path: high refresh concurrency while EU is still storming", () => {
      it("amplifies the storm rather than helping it", () => {
        const baseline = runScenario(INCIDENT_ONSET_MS + 10_000);
        const amplified = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: REFRESH_CONCURRENCY_KEY, value: "high" },
        ]);
        expect(amplified.transitions.incidentState).toBe("high-refresh-concurrency-amplifies-storm");
        expect(amplified.values.euRevalidationStormRatePerMin as number).toBeGreaterThan(
          baseline.values.euRevalidationStormRatePerMin as number,
        );
        expect(amplified.values.originRequestsPerSec as number).toBeGreaterThan(
          baseline.values.originRequestsPerSec as number,
        );
      });
    });

    describe("Long TTL tradeoff: protects Origin modestly but widens the staleness bound", () => {
      it("raising TTL to 900s increases the stale-read rate versus the short-TTL baseline", () => {
        const baseline = runScenario(INCIDENT_ONSET_MS + 10_000);
        const longTtl = runScenario(INCIDENT_ONSET_MS + 10_000, [
          { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: US_TTL_SECONDS_KEY, value: 900 },
        ]);
        expect(longTtl.transitions.incidentState).toBe("long-ttl-worsens-staleness-bound");
        expect(longTtl.values.usStaleReadRatePct as number).toBeGreaterThan(
          baseline.values.usStaleReadRatePct as number,
        );
      });
    });

    describe("Cross-region contagion: EU's storm degrades APAC when unisolated", () => {
      it("APAC's own freshness degrades once the desync is sustained and EU remains unisolated", () => {
        const state = runScenario(SUSTAINED_DESYNC_MS + 5_000);
        expect(state.transitions.incidentState).toBe("eu-storm-contagion-unisolated");
        expect(state.values.apacFreshnessStatus).toBe("warning");
      });

      it("isolation protects APAC from the same sustained contagion window", () => {
        const isolated = runScenario(SUSTAINED_DESYNC_MS + 5_000, [
          { atMs: SUSTAINED_DESYNC_MS - 5_000, controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY, value: true },
        ]);
        expect(isolated.values.apacFreshnessStatus).toBe("normal");
      });
    });

    describe("Historical damage model: stale-serve counter freezes, never silently resets", () => {
      it("bypassing US stops NEW stale serves but freezes (does not reset) the historical counter", () => {
        const before = runScenario(SUSTAINED_DESYNC_MS + 5_000);
        const afterFix = runScenario(SUSTAINED_DESYNC_MS + 15_000, [
          { atMs: SUSTAINED_DESYNC_MS + 6_000, controlKey: US_CACHE_MODE_KEY, value: "bypass" },
        ]);
        expect(afterFix.values.usFreshnessStatus).toBe("normal");
        expect(afterFix.values.staleServesPastFreshnessBoundCount).toBe(
          before.values.staleServesPastFreshnessBoundCount,
        );
      });
    });

    describe("Multi-step path", () => {
      it("step 1 alone (isolation) leaves both regional problems unresolved", () => {
        const state = runScenario(SUSTAINED_DESYNC_MS + 5_000, [
          { atMs: SUSTAINED_DESYNC_MS + 1_000, controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY, value: true },
        ]);
        expect(state.values.usFreshnessStatus).toBe("critical");
        expect(state.values.euInvalidationStormStatus).toBe("critical");
      });

      it("step 2 on top of step 1 (EU dedup) stops EU's storm but leaves US stale", () => {
        const state = runScenario(SUSTAINED_DESYNC_MS + 5_000, [
          { atMs: SUSTAINED_DESYNC_MS + 1_000, controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY, value: true },
          { atMs: SUSTAINED_DESYNC_MS + 2_000, controlKey: EU_INVALIDATION_REPLAY_MODE_KEY, value: "deduplicated" },
        ]);
        expect(state.transitions.incidentState).toBe("eu-targeted-dedup-us-stale");
        expect(state.values.usFreshnessStatus).toBe("critical");
        expect(state.values.euInvalidationStormStatus).toBe("normal");
      });

      it("step 3 on top of steps 1-2 (US bypass) finally resolves both regional problems (recovery just engaged)", () => {
        const state = runScenario(SUSTAINED_DESYNC_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        expect(state.transitions.incidentState).toBe("recovery-just-engaged");
        expect(state.values.usFreshnessStatus).toBe("normal");
        expect(state.values.euInvalidationStormStatus).toBe("normal");
      });
    });

    describe("Sequencing sensitivity", () => {
      it("safe sequence (isolate -> dedup -> bypass) reaches recovery-just-engaged with both problems fixed", () => {
        const state = runScenario(SUSTAINED_DESYNC_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        expect(state.transitions.incidentState).toBe("recovery-just-engaged");
      });

      it("unsafe sequence (bypass US globally first, i.e. reach for global bypass instead of targeted) produces worse Origin load than the safe targeted sequence at the same elapsed point", () => {
        const unsafe = runScenario(SUSTAINED_DESYNC_MS + 5_000, [
          { atMs: SUSTAINED_DESYNC_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
        ]);
        const safe = runScenario(SUSTAINED_DESYNC_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        expect(unsafe.values.originRequestsPerSec as number).toBeGreaterThan(
          safe.values.originRequestsPerSec as number,
        );
        expect(unsafe.values.originStatus).toBe("critical");
        expect(safe.values.originStatus).not.toBe("critical");
      });
    });

    describe("Recovery lag: real elapsed time required after both regional fixes are engaged", () => {
      it("immediately after engaging both fixes, the system is not yet fully recovered", () => {
        const justAfter = runScenario(SUSTAINED_DESYNC_MS + 4_000, SAFE_SEQUENCE_ACTIONS);
        expect(justAfter.transitions.incidentState).toBe("recovery-just-engaged");
        expect(justAfter.values.euCacheHitRatePct).toBeLessThan(90);
      });

      it("after the first recovery window, EU has genuinely re-warmed further but is not yet fully recovered", () => {
        const window1 = runScenario(RECOVERY_WINDOW_1_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        expect(window1.transitions.incidentState).toBe("recovery-window1-draining");
        expect(window1.values.euCacheHitRatePct as number).toBeGreaterThan(60);
        expect(window1.values.invalidationSystemStatus).not.toBe("fully-recovered");
      });

      it("after the second recovery window, Origin has settled further still", () => {
        const window1 = runScenario(RECOVERY_WINDOW_1_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        const window2 = runScenario(RECOVERY_WINDOW_2_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        expect(window2.transitions.incidentState).toBe("recovery-window2-near-recovered");
        expect(window2.values.originRequestsPerSec as number).toBeLessThan(
          window1.values.originRequestsPerSec as number,
        );
      });

      it("only after the full recovery window does the system reach genuine fully-recovered status", () => {
        const drained = runScenario(RECOVERY_WINDOW_FULL_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
        expect(drained.transitions.incidentState).toBe("fully-recovered");
        expect(drained.values.invalidationSystemStatus).toBe("fully-recovered");
        expect(drained.values.originStatus).toBe("normal");
      });
    });

    it("tracks peak historical counters generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_DESYNC_MS + 5_000, [
        { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: REFRESH_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(state.peaks.peakValues.staleServesPastFreshnessBoundCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.euRevalidationStormRatePerMin).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(INCIDENT_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(SUSTAINED_DESYNC_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("bounded-acceptable-swr is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(SUSTAINED_DESYNC_MS + 35_000, SWR_SEQUENCE_ACTIONS);
      expect(state.transitions.incidentState).toBe("bounded-acceptable-swr");
      const eligibility = evaluateCompletionEligibility(cacheInvalidationAcrossRegionsSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("targeted-partial states (one region fixed, Origin not yet settled) are never Finish-eligible", () => {
      const state = runScenario(SUSTAINED_DESYNC_MS + 35_000, [
        { atMs: SUSTAINED_DESYNC_MS + 1_000, controlKey: REGIONAL_INVALIDATOR_ISOLATION_KEY, value: true },
        { atMs: SUSTAINED_DESYNC_MS + 2_000, controlKey: EU_INVALIDATION_REPLAY_MODE_KEY, value: "deduplicated" },
      ]);
      expect(state.transitions.incidentState).toBe("eu-targeted-dedup-us-stale");
      const eligibility = evaluateCompletionEligibility(cacheInvalidationAcrossRegionsSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("fully-recovered is Finish-eligible as optimal", () => {
      const state = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SAFE_SEQUENCE_ACTIONS);
      const eligibility = evaluateCompletionEligibility(cacheInvalidationAcrossRegionsSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("Finish from the fully-recovered path -> resolved/optimal", () => {
      const state = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SAFE_SEQUENCE_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("fully-recovered-via-swr is also Finish-eligible as optimal (alternate strong path)", () => {
      const state = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SWR_SEQUENCE_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-recovered-via-swr");
      const eligibility = evaluateCompletionEligibility(cacheInvalidationAcrossRegionsSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("stays active (never auto-fails) even after Origin overload remains breached past the old sustained window, in candidate_declared mode", () => {
      const state = runScenario(INCIDENT_ONSET_MS + 65_000, [
        { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
        { atMs: INCIDENT_ONSET_MS + 2_000, controlKey: REFRESH_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(60);
      const result = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path (fully-recovered) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SAFE_SEQUENCE_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, state);
      const inputs = extractFinishScoringInputs(cacheInvalidationAcrossRegionsSimulation, result);
      const score = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(800);
      console.log("OPTIMAL SCORE", JSON.stringify(score));
    });

    it("alternate strong path (fully-recovered-via-swr) also scores well, near optimal", () => {
      const optimalState = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SAFE_SEQUENCE_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(cacheInvalidationAcrossRegionsSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, optimalInputs);

      const swrState = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SWR_SEQUENCE_ACTIONS);
      const swrResult = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, swrState);
      const swrInputs = extractFinishScoringInputs(cacheInvalidationAcrossRegionsSimulation, swrResult);
      const swrScore = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, swrInputs);

      expect(swrResult.completionTier).toBe("optimal");
      expect(swrScore.breakdown.dataIntegrity).toBe(200);
      expect(swrScore.total).toBeGreaterThan(800);
      console.log("ALTERNATE STRONG PATH (SWR) SCORE", JSON.stringify(swrScore));
      console.log("OPTIMAL (BYPASS) SCORE", JSON.stringify(optimalScore));
    });

    it("acceptable path (bounded-acceptable-swr) scores well but below optimal", () => {
      const optimalState = runScenario(RECOVERY_WINDOW_FULL_MS + 35_000, SAFE_SEQUENCE_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, optimalState);
      const optimalInputs = extractFinishScoringInputs(cacheInvalidationAcrossRegionsSimulation, optimalResult);
      const optimalScore = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, optimalInputs);

      const acceptableState = runScenario(SUSTAINED_DESYNC_MS + 35_000, SWR_SEQUENCE_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(cacheInvalidationAcrossRegionsSimulation, acceptableState);
      const acceptableInputs = extractFinishScoringInputs(cacheInvalidationAcrossRegionsSimulation, acceptableResult);
      const acceptableScore = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, acceptableInputs);

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      expect(acceptableScore.breakdown.dataIntegrity).toBeLessThan(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(150);
      console.log("ACCEPTABLE SCORE", JSON.stringify(acceptableScore));
    });

    it("baseline (no action) scores poorly with zero recovery/reliability credit", () => {
      const state = runScenario(SUSTAINED_DESYNC_MS + 60_000);
      const inputs = scoringInputsFromState(state);
      const score = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      expect(score.breakdown.reliability).toBe(0);
      expect(score.breakdown.dataIntegrity).toBeLessThan(150);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful path (global bypass) scores worse on dataIntegrity than baseline despite looking available", () => {
      const baselineState = runScenario(INCIDENT_ONSET_MS + 10_000);
      const baselineInputs = scoringInputsFromState(baselineState);
      const baselineScore = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, baselineInputs);

      const globalBypassState = runScenario(INCIDENT_ONSET_MS + 10_000, [
        { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: GLOBAL_CACHE_BYPASS_KEY, value: true },
      ]);
      const harmfulInputs = scoringInputsFromState(globalBypassState);
      const harmfulScore = scoreAuthoredAttempt(CACHE_INVALIDATION_ACROSS_REGIONS_SCORING, harmfulInputs);

      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThan(baselineScore.breakdown.dataIntegrity);
      expect(harmfulScore.breakdown.dataIntegrity).toBeLessThanOrEqual(20);
      console.log("HARMFUL (global bypass) SCORE", JSON.stringify(harmfulScore));
      console.log("BASELINE (for comparison) SCORE", JSON.stringify(baselineScore));
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(RECOVERY_WINDOW_1_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
      const runB = runScenario(RECOVERY_WINDOW_1_MS + 5_000, SAFE_SEQUENCE_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Origin-concurrency-only partial relief", () => {
    it("raising Origin concurrency alone helps Origin somewhat but fixes neither regional root cause", () => {
      const baseline = runScenario(INCIDENT_ONSET_MS + 10_000);
      const capacityOnly = runScenario(INCIDENT_ONSET_MS + 10_000, [
        { atMs: INCIDENT_ONSET_MS + 1_000, controlKey: ORIGIN_CONCURRENCY_KEY, value: "high" },
      ]);
      expect(capacityOnly.transitions.incidentState).toBe("origin-capacity-only-partial-relief");
      expect(capacityOnly.values.usFreshnessStatus).toBe("critical");
      expect(capacityOnly.values.euInvalidationStormStatus).toBe("critical");
      expect(capacityOnly.values.originLatencyMs as number).toBeLessThan(
        baseline.values.originLatencyMs as number,
      );
    });
  });
});
