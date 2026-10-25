import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  extractScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { webhookDeliveryStorm } from "./webhook-delivery-storm";
import {
  DESTINATION_ISOLATION_ENABLED_KEY,
  DISPATCHER_CONCURRENCY_KEY,
  DLQ_ESCALATION_THRESHOLD_KEY,
  MAX_RETRY_ATTEMPTS_KEY,
  RETRY_BACKOFF_KEY,
  webhookDeliveryStormSimulation,
  WORKER_COUNT_KEY,
} from "./webhook-delivery-storm/definition";
import { webhookDeliveryStormCandidateUI } from "./webhook-delivery-storm/candidate-ui";
import { WEBHOOK_DELIVERY_STORM_SCORING } from "./webhook-delivery-storm/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(webhookDeliveryStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += webhookDeliveryStormSimulation.tickMs
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
      webhookDeliveryStormSimulation,
      state,
      action,
      webhookDeliveryStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const PROVIDER_OUTAGE_MS = 30_000;
const DLQ_ESCALATION_MS = PROVIDER_OUTAGE_MS + 3 * 60_000;

describe("Webhook Delivery Storm", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid scenario", () => {
      expect(webhookDeliveryStorm.isFree).toBe(false);
      expect(webhookDeliveryStorm.library?.category).toBe("API & Traffic");
      expect(webhookDeliveryStorm.library?.tags.length).toBeGreaterThan(0);
      expect(webhookDeliveryStorm.library?.skills.length).toBeGreaterThan(0);
      expect(webhookDeliveryStorm.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = WEBHOOK_DELIVERY_STORM_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = WEBHOOK_DELIVERY_STORM_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(webhookDeliveryStormCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(webhookDeliveryStormCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(webhookDeliveryStormCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(webhookDeliveryStormCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(webhookDeliveryStormSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBe(180);
      expect(state.values.deliveryIsolationState).toBe("unresolved");
    });

    it("the shared-provider outage triggers the blast-radius baseline incident", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(PROVIDER_OUTAGE_MS);
      expect(state.status).toBe("critical");
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBe(1_450);
      expect(state.values.deliveryIsolationState).toBe("blast-radius");
    });

    it("strong path: destination isolation keeps healthy-destination latency near baseline", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 20_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBe(190);
      expect(state.values.deliveryIsolationState).toBe("isolated");
      expect(state.values.dispatcherStatus).toBe("warning");
    });

    it("harmful path: raising dispatcher concurrency without isolation makes healthy-destination latency WORSE than baseline (blast radius)", () => {
      const baseline = runScenario(PROVIDER_OUTAGE_MS + 20_000);
      const scaled = runScenario(PROVIDER_OUTAGE_MS + 20_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DISPATCHER_CONCURRENCY_KEY, value: 400 },
      ]);

      expect(scaled.values.healthyDestinationDeliveryLatencyMs).toBeGreaterThan(
        baseline.values.healthyDestinationDeliveryLatencyMs as number,
      );
      expect(scaled.values.deliveryIsolationState).toBe("blast-radius");
      expect(scaled.values.dispatcherStatus).toBe("critical");
    });

    it("harmful path: adding dispatcher workers without isolation also worsens healthy-destination latency", () => {
      const baseline = runScenario(PROVIDER_OUTAGE_MS + 20_000);
      const scaled = runScenario(PROVIDER_OUTAGE_MS + 20_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: WORKER_COUNT_KEY, value: 32 },
      ]);

      expect(scaled.values.healthyDestinationDeliveryLatencyMs).toBeGreaterThan(
        baseline.values.healthyDestinationDeliveryLatencyMs as number,
      );
      expect(scaled.values.dispatcherStatus).toBe("critical");
    });

    it("harmful path: unbounded retries without isolation deepen the blast radius beyond baseline", () => {
      const baseline = runScenario(PROVIDER_OUTAGE_MS + 20_000);
      const unbounded = runScenario(PROVIDER_OUTAGE_MS + 20_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 999 },
      ]);

      expect(unbounded.values.healthyDestinationDeliveryLatencyMs).toBeGreaterThan(
        baseline.values.healthyDestinationDeliveryLatencyMs as number,
      );
      expect(unbounded.values.webhookBacklog).toBeGreaterThan(baseline.values.webhookBacklog as number);
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.dispatcherStatus).toBe("critical");
    });

    it("partial path: exponential backoff alone gives real relief but stays blast-radius-affected", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 20_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: RETRY_BACKOFF_KEY, value: "exponential" },
      ]);
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBe(650);
      expect(state.values.deliveryIsolationState).toBe("blast-radius");
      // Materially better than un-mitigated baseline (1450ms) but still
      // far above the 180ms pre-incident baseline and the 250ms success bar.
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBeLessThan(1_450);
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBeGreaterThan(250);
    });

    it("partial path: tightening the DLQ escalation threshold alone also stays blast-radius-affected", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 20_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DLQ_ESCALATION_THRESHOLD_KEY, value: 20 },
      ]);
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBe(980);
      expect(state.values.deliveryIsolationState).toBe("blast-radius");
    });

    it("delayed consequence: sustained unmitigated storm escalates DLQ depth on a second wave, with an already-visible precursor", () => {
      const beforeSecondWave = runScenario(PROVIDER_OUTAGE_MS + 60_000);
      // Observable precursor already visible before the second wave lands.
      expect(beforeSecondWave.values.webhookBacklog).toBeGreaterThan(20);
      expect(beforeSecondWave.values.retryVolumePerMinute).toBeGreaterThan(40);

      const afterSecondWave = runScenario(DLQ_ESCALATION_MS + 5_000);
      expect(afterSecondWave.values.dlqDepth).toBe(5_200);
      expect(afterSecondWave.values.dispatcherStatus).toBe("critical");
    });

    it("delayed consequence is contained to the failing subset once isolation is already on", () => {
      const state = runScenario(DLQ_ESCALATION_MS + 5_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      expect(state.values.dlqDepth).toBe(900);
      expect(state.values.healthyDestinationDeliveryLatencyMs).toBe(195);
      expect(state.values.deliveryIsolationState).toBe("isolated");
    });

    it("fails if dispatcher worker utilization stays at or above 99% for the full sustained window", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 2_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 999 },
      ]);
      const extended = runScenario(PROVIDER_OUTAGE_MS + 61_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 999 },
      ]);
      expect(state.values.dispatcherWorkerUtilization).toBe(99);
      expect(extended.status).toBe("failed");
      expect(extended.failedAtMs).not.toBeNull();
    });

    it("tracks peak healthy-destination latency and peak backlog generically via numericWatchFields", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 1_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DISPATCHER_CONCURRENCY_KEY, value: 400 },
      ]);
      expect(state.peaks.peakValues.healthyDestinationDeliveryLatencyMs).toBeGreaterThanOrEqual(1_450);
    });

    it("tracks monthly infrastructure cost that increases with both dispatcher concurrency and worker count", () => {
      let state = createInitialState(webhookDeliveryStormSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(260);

      const tickMs = webhookDeliveryStormSimulation.tickMs;
      state = simulate(
        webhookDeliveryStormSimulation,
        state,
        { id: "scale-concurrency", timestampMs: 0, controlKey: DISPATCHER_CONCURRENCY_KEY, value: 400 },
        tickMs,
      ).state;
      state = simulate(
        webhookDeliveryStormSimulation,
        state,
        { id: "scale-workers", timestampMs: tickMs, controlKey: WORKER_COUNT_KEY, value: 32 },
        tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(260 + 360 + 520);
    });
  });

  describe("Completion mode: candidate_declared, OPTIMAL-only (no acceptable tier)", () => {
    it("isolation, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(webhookDeliveryStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("exponential backoff alone (partial relief) remains ineligible for any Finish tier", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: RETRY_BACKOFF_KEY, value: "exponential" },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(webhookDeliveryStormSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        webhookDeliveryStormSimulation.successCondition.sustainedSeconds,
      );
    });

    it("Finish from optimal (isolated) -> resolved/optimal", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(webhookDeliveryStormSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(webhookDeliveryStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("Finish from unsafe (partial backoff-only relief) -> declared_unstable, not a free pass", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: RETRY_BACKOFF_KEY, value: "exponential" },
      ]);
      const result = evaluateCandidateDeclaredFinish(webhookDeliveryStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(PROVIDER_OUTAGE_MS + 61_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: MAX_RETRY_ATTEMPTS_KEY, value: 999 },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(webhookDeliveryStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("immediate-Finish audit: zero changes, Finish right at incident start, does NOT resolve prematurely", () => {
      // Exactly at the trigger instant — zero candidate actions taken.
      const state = runScenario(PROVIDER_OUTAGE_MS + webhookDeliveryStormSimulation.tickMs);
      expect(state.incidentStartedAtMs).toBe(PROVIDER_OUTAGE_MS);
      const result = evaluateCandidateDeclaredFinish(webhookDeliveryStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
      // Even isolating immediately requires the successCondition's own
      // 30-second sustain window (this scenario's own timing scale —
      // roughly a tenth of the ~5-minute incident) to elapse with the
      // condition genuinely holding before Finish is eligible; it is
      // never free at t=0.
      const isolatedImmediately = runScenario(PROVIDER_OUTAGE_MS + 1_000, [
        { atMs: PROVIDER_OUTAGE_MS, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      const immediateResult = evaluateCandidateDeclaredFinish(
        webhookDeliveryStormSimulation,
        isolatedImmediately,
      );
      expect(immediateResult.outcome).toBe("declared_unstable");
      expect(isolatedImmediately.transitions.consecutiveSuccessSeconds).toBeLessThan(
        webhookDeliveryStormSimulation.successCondition.sustainedSeconds,
      );
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ];
      const runA = runScenario(PROVIDER_OUTAGE_MS + 40_000, actions);
      const runB = runScenario(PROVIDER_OUTAGE_MS + 40_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (isolated), baseline, harmful (scaled concurrency), and partial (backoff) paths with coherent ordering", () => {
      const goodState = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DESTINATION_ISOLATION_ENABLED_KEY, value: true },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(webhookDeliveryStormSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        WEBHOOK_DELIVERY_STORM_SCORING,
        extractFinishScoringInputs(webhookDeliveryStormSimulation, goodFinish),
      );

      const baselineState = runScenario(PROVIDER_OUTAGE_MS + 40_000);
      const baselineScore = scoreAuthoredAttempt(
        WEBHOOK_DELIVERY_STORM_SCORING,
        extractScoringInputs(webhookDeliveryStormSimulation, baselineState),
      );

      const harmfulState = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: DISPATCHER_CONCURRENCY_KEY, value: 400 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        WEBHOOK_DELIVERY_STORM_SCORING,
        extractScoringInputs(webhookDeliveryStormSimulation, harmfulState),
      );

      const partialState = runScenario(PROVIDER_OUTAGE_MS + 40_000, [
        { atMs: PROVIDER_OUTAGE_MS + 1_000, controlKey: RETRY_BACKOFF_KEY, value: "exponential" },
      ]);
      const partialScore = scoreAuthoredAttempt(
        WEBHOOK_DELIVERY_STORM_SCORING,
        extractScoringInputs(webhookDeliveryStormSimulation, partialState),
      );

      const immediateFinishState = runScenario(
        PROVIDER_OUTAGE_MS + webhookDeliveryStormSimulation.tickMs,
      );
      const immediateFinish = evaluateCandidateDeclaredFinish(
        webhookDeliveryStormSimulation,
        immediateFinishState,
      );
      const immediateFinishScore = scoreAuthoredAttempt(
        WEBHOOK_DELIVERY_STORM_SCORING,
        extractFinishScoringInputs(webhookDeliveryStormSimulation, immediateFinish),
      );

      // Actual executed totals (asserted on the real numbers produced).
      expect(goodScore.total).toBe(865);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(460);
      expect(partialScore.total).toBe(550);
      expect(immediateFinishScore.total).toBe(550);

      expect(goodScore.total).toBeGreaterThan(baselineScore.total);
      expect(goodScore.total).toBeGreaterThan(harmfulScore.total);
      expect(goodScore.total).toBeGreaterThan(partialScore.total);
      expect(goodScore.total).toBeGreaterThan(immediateFinishScore.total);
      // Baseline/partial/immediate-finish never reach Finish eligibility
      // and took no harmful action, so they all score identically as
      // unresolved attempts via the shared terminal-override guard
      // (never a fabricated resolvedAtMs) — a legitimate tie on the
      // same unresolved floor. Harmful scores strictly lower than that
      // floor because scaling dispatcher concurrency without isolation
      // is itself a classified harmful action, penalized on
      // operationalEfficiency on top of the same unresolved floor.
      expect(baselineScore.total).toBe(partialScore.total);
      expect(baselineScore.total).toBe(immediateFinishScore.total);
      expect(harmfulScore.total).toBeLessThan(baselineScore.total);
    });
  });
});
