import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { eventPlatformPartialOutage } from "./event-platform-partial-outage";
import {
  BATCH_SIZE_KEY,
  CONSUMER_B_CONCURRENCY_KEY,
  CONSUMER_C_RETRY_MODE_KEY,
  DLQ_POLICY_KEY,
  DOWNSTREAM_CIRCUIT_BREAKER_KEY,
  PARTITION_ISOLATION_KEY,
  PRODUCER_BACKPRESSURE_KEY,
  eventPlatformPartialOutageSimulation,
} from "./event-platform-partial-outage/definition";
import { eventPlatformPartialOutageCandidateUI } from "./event-platform-partial-outage/candidate-ui";
import { EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING } from "./event-platform-partial-outage/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  BROKER_PARTITION_DEGRADED_MS,
  BROKER_RECOVERY_WINDOW_ELAPSED_MS,
  CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
  CONSUMER_B_LAG_ONSET_MS,
  CONSUMER_C_RETRY_STORM_MS,
  DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
  TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS,
} from "./event-platform-partial-outage/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(eventPlatformPartialOutageSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += eventPlatformPartialOutageSimulation.tickMs) {
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

    const result = simulate(eventPlatformPartialOutageSimulation, state, action, eventPlatformPartialOutageSimulation.tickMs);
    state = result.state;
  }

  return state;
}

// Correct, fully safe control combination: isolate the broker partition
// class, keep batch size bounded, scale Consumer Group B enough, and
// switch Consumer Group C off aggressive retries.
const SAFE_ACTIONS: TimedAction[] = [
  { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
  { atMs: CONSUMER_C_RETRY_STORM_MS + 2_000, controlKey: BATCH_SIZE_KEY, value: 100 },
  { atMs: CONSUMER_C_RETRY_STORM_MS + 3_000, controlKey: CONSUMER_B_CONCURRENCY_KEY, value: 8 },
  { atMs: CONSUMER_C_RETRY_STORM_MS + 4_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "circuit-breaker" },
];

// Unsafe combination left in place past the Topic A exposure window:
// unisolated + large batch + aggressive retries.
const TOPIC_A_CONTAMINATION_ACTIONS: TimedAction[] = [
  { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: BATCH_SIZE_KEY, value: 2_000 },
];

describe("Event Platform Partial Outage", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(eventPlatformPartialOutage.isFree).toBe(false);
      expect(eventPlatformPartialOutage.library?.category).toBe("Messaging & Streaming");
      expect(eventPlatformPartialOutage.library?.tags.length).toBeGreaterThan(0);
      expect(eventPlatformPartialOutage.library?.skills.length).toBeGreaterThan(0);
      expect(eventPlatformPartialOutage.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(eventPlatformPartialOutageCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(eventPlatformPartialOutageCandidateUI.controls.length).toBeGreaterThanOrEqual(6);
      expect(eventPlatformPartialOutageCandidateUI.components.length).toBe(10);
    });

    it("the architecture has exactly 10 nodes and 11 edges matching the spec", () => {
      expect(eventPlatformPartialOutageSimulation.architecture.nodes.length).toBe(10);
      expect(eventPlatformPartialOutageSimulation.architecture.edges.length).toBe(11);
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(eventPlatformPartialOutage.description).toMatch(/Topic A events must remain durable/i);
      expect(eventPlatformPartialOutage.description).toMatch(/Topic C events may be delayed/i);
      expect(eventPlatformPartialOutage.description).toMatch(/destabilize unrelated topics/i);
      expect(eventPlatformPartialOutage.description).toMatch(/dropping events merely to reduce lag is not acceptable/i);
    });

    it("every meaningful action-classification rule carries feedback (100% coverage)", () => {
      const rules = eventPlatformPartialOutageSimulation.actionClassifications;
      expect(rules.length).toBeGreaterThan(0);
      for (const rule of rules) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(eventPlatformPartialOutageSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.topicAEventsDroppedTotal).toBe(0);
      expect(state.values.topicADurabilityPct).toBe(100);
    });

    it("all three root causes fire independently and are visible as separate triggers", () => {
      const afterBroker = runScenario(BROKER_PARTITION_DEGRADED_MS + 500);
      expect(afterBroker.triggers.brokerPartitionDegraded).toBe(true);
      expect(afterBroker.triggers.consumerBLagging).toBeFalsy();
      expect(afterBroker.triggers.consumerCRetryStorm).toBeFalsy();

      const afterB = runScenario(CONSUMER_B_LAG_ONSET_MS + 500);
      expect(afterB.triggers.consumerBLagging).toBe(true);
      expect(afterB.triggers.consumerCRetryStorm).toBeFalsy();

      const afterC = runScenario(CONSUMER_C_RETRY_STORM_MS + 500);
      expect(afterC.triggers.consumerCRetryStorm).toBe(true);
      expect(afterC.transitions.incidentState).toBe("all-three-unmitigated");
    });

    it("baseline (no action) leaves all three problems active and Topic A still safe", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000);
      expect(state.transitions.incidentState).toBe("all-three-unmitigated");
      expect(state.values.consumerBLagMessages).toBeGreaterThan(5_000);
      expect(state.values.downstreamHealthPct).toBeLessThan(50);
      expect(state.values.topicADurabilityPct).toBe(100);
    });
  });

  describe("Required pressure-transfer mechanism: naive Consumer Group B scale-up worsens the downstream dependency", () => {
    it("harmful/tempting path: scaling Group B to 16 drains its own lag but makes downstreamHealthPct worse than doing nothing", () => {
      const baseline = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000);
      const naiveScaleUp = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: CONSUMER_B_CONCURRENCY_KEY, value: 16 },
      ]);

      // Group B's own lag genuinely looks fixed.
      expect(naiveScaleUp.values.consumerBLagMessages).toBeLessThan(baseline.values.consumerBLagMessages as number);
      expect(naiveScaleUp.transitions.incidentState).toBe("pressure-transferred-downstream");

      // But the downstream dependency is measurably WORSE than the
      // untouched baseline -- real, distinct authored numbers.
      expect(naiveScaleUp.values.downstreamHealthPct).toBeLessThan(baseline.values.downstreamHealthPct as number);
      expect(naiveScaleUp.values.downstreamHealthPct).toBe(14);
      expect(baseline.values.downstreamHealthPct).toBe(35);

      const eligibility = evaluateCompletionEligibility(eventPlatformPartialOutageSimulation, naiveScaleUp);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Historical damage: Topic A drops persist after the live configuration is fixed", () => {
    it("the unsafe combination, left in place past the exposure window, causes real Topic A drops", () => {
      const state = runScenario(TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 2_000, TOPIC_A_CONTAMINATION_ACTIONS);
      expect(state.transitions.incidentState).toBe("topic-a-contaminated-active");
      expect(state.values.topicAEventsDroppedTotal).toBeGreaterThan(0);
      expect(state.values.topicADurabilityPct).toBeLessThan(100);
      expect(state.peaks.peakValues.topicAEventsDroppedTotal).toBeGreaterThan(0);
    });

    it("fixing isolation/batch size AFTER contamination stops new drops, but the historical total does not reset to zero", () => {
      const contaminatedThenFixed = runScenario(TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 10_000, [
        ...TOPIC_A_CONTAMINATION_ACTIONS,
        { atMs: TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 5_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
        { atMs: TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 6_000, controlKey: BATCH_SIZE_KEY, value: 100 },
      ]);

      expect(contaminatedThenFixed.transitions.incidentState).toBe("topic-a-scarred-live-safe");
      // Live durability has recovered -- no NEW drops right now.
      expect(contaminatedThenFixed.values.topicADurabilityPct).toBe(100);
      // But the historical total is still the exact figure reached
      // during active contamination, not reset to zero.
      expect(contaminatedThenFixed.values.topicAEventsDroppedTotal).toBe(340);
      expect(contaminatedThenFixed.peaks.peakValues.topicAEventsDroppedTotal).toBe(340);

      // Genuinely unsafe to hand back despite the live reading looking
      // perfect.
      const eligibility = evaluateCompletionEligibility(eventPlatformPartialOutageSimulation, contaminatedThenFixed);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("a candidate who was always safe (isolated AND retry mode fixed) never contaminates Topic A -- the peak stays at zero", () => {
      // Isolation alone is not enough to disambiguate from the scarred
      // state below (both leave consumerCRetryMode at its default
      // "aggressive"), since the engine matches rules purely on CURRENT
      // trigger/control state, never on history (see rules.ts's scope
      // note). A candidate who fixes retry mode too lands unambiguously
      // in a state no contamination rule can match.
      const alwaysSafe = runScenario(TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 10_000, [
        { atMs: BROKER_PARTITION_DEGRADED_MS + 1_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
        { atMs: BROKER_PARTITION_DEGRADED_MS + 2_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "circuit-breaker" },
      ]);
      expect(alwaysSafe.values.topicAEventsDroppedTotal).toBe(0);
      expect(alwaysSafe.peaks.peakValues.topicAEventsDroppedTotal).toBe(0);
    });

    it("reserving Topic A priority mitigates but does not eliminate contamination when isolation is never applied", () => {
      const protectedButUnisolated = runScenario(TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 2_000, [
        ...TOPIC_A_CONTAMINATION_ACTIONS,
        { atMs: CONSUMER_C_RETRY_STORM_MS + 2_000, controlKey: "topicAPriority" as const, value: "protected" },
      ]);
      expect(protectedButUnisolated.transitions.incidentState).toBe("topic-a-contaminated-partially-protected");
      expect(protectedButUnisolated.values.topicAEventsDroppedTotal).toBeGreaterThan(0);
      expect(protectedButUnisolated.values.topicAEventsDroppedTotal).toBeLessThan(340);
    });
  });

  describe("Dropping events merely to reduce lag is not acceptable: bounded retries without a DLQ", () => {
    it("bounding Consumer Group C's retries without enabling the DLQ discards genuinely-exhausted events", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "bounded" },
      ]);
      expect(state.transitions.incidentState).toBe("bounded-retries-events-discarded");
      expect(state.values.dlqBacklogCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(eventPlatformPartialOutageSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("pairing bounded retries with the DLQ enabled is a genuine, distinct improvement", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "bounded" },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 2_000, controlKey: DLQ_POLICY_KEY, value: "enabled" },
      ]);
      expect(state.transitions.incidentState).not.toBe("bounded-retries-events-discarded");
    });
  });

  describe("Masking, not fixing: producer backpressure makes the broker dashboard look calmer without touching Group B or Group C", () => {
    it("enabling producer backpressure genuinely improves broker-facing metrics versus doing nothing at all", () => {
      const baseline = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000);
      const backpressureOnly = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PRODUCER_BACKPRESSURE_KEY, value: true },
      ]);

      expect(backpressureOnly.transitions.incidentState).toBe("producer-backpressure-masked");
      expect(baseline.transitions.incidentState).toBe("all-three-unmitigated");

      // Real, distinct, measurable effect: this is not a no-op.
      expect(backpressureOnly.values.brokerPartitionHealth).toBeGreaterThan(
        baseline.values.brokerPartitionHealth as number,
      );
      expect(backpressureOnly.values.topicBBacklogMessages).toBeLessThan(
        baseline.values.topicBBacklogMessages as number,
      );
      expect(backpressureOnly.values.brokerPartitionHealth).toBe(68);
      expect(backpressureOnly.values.topicBBacklogMessages).toBe(7_400);
    });

    it("but Consumer Group B's own lag and Consumer Group C's retry storm against the downstream are completely untouched", () => {
      const baseline = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000);
      const backpressureOnly = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PRODUCER_BACKPRESSURE_KEY, value: true },
      ]);

      // A producer-side lever has zero reach into the consumer-side or
      // downstream-side problems -- these read identically to baseline.
      expect(backpressureOnly.values.consumerBLagMessages).toBe(baseline.values.consumerBLagMessages);
      expect(backpressureOnly.values.consumerCRetryRatePerMinute).toBe(baseline.values.consumerCRetryRatePerMinute);
      expect(backpressureOnly.values.downstreamHealthPct).toBe(baseline.values.downstreamHealthPct);
      expect(backpressureOnly.values.platformStatus).toBe("critical");
    });

    it("is never classified as a genuine fix: not eligible, and never reaches acceptable or optimal on its own", () => {
      const backpressureOnly = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PRODUCER_BACKPRESSURE_KEY, value: true },
      ]);

      const eligibility = evaluateCompletionEligibility(eventPlatformPartialOutageSimulation, backpressureOnly);
      expect(eligibility).toEqual({ eligible: false });

      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, backpressureOnly);
      expect(finish.outcome).toBe("declared_unstable");

      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      // dataIntegrity has no terminalOverrides -- it is measured off
      // the live platformStatus="critical" snapshot, same harsh
      // penalty band as the genuine unmitigated baseline.
      expect(result.breakdown.dataIntegrity).toBe(20);
    });

    it("scores no better than the genuine unmitigated baseline -- a calmer-looking broker metric does not buy a higher total", () => {
      const baseline = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000);
      const backpressureOnly = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PRODUCER_BACKPRESSURE_KEY, value: true },
      ]);

      const baselineFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, baseline);
      const backpressureFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, backpressureOnly);

      const baselineInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, baselineFinish);
      const backpressureInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, backpressureFinish);

      const baselineScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, baselineInputs);
      const backpressureScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, backpressureInputs);

      expect(backpressureScore.total).toBeLessThanOrEqual(baselineScore.total);
    });

    it("combined with the three genuine fixes, backpressure neither helps nor blocks reaching the optimal state", () => {
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      const withBackpressure = runScenario(lastWindow + 25_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 500, controlKey: PRODUCER_BACKPRESSURE_KEY, value: true },
        ...SAFE_ACTIONS,
      ]);
      expect(withBackpressure.transitions.incidentState).toBe("all-mitigated-recovered");

      const eligibility = evaluateCompletionEligibility(eventPlatformPartialOutageSimulation, withBackpressure);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Three independent problems require three independent fixes", () => {
    it("fixing only the broker + downstream leaves Consumer Group B's own lag outstanding", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 2_000, controlKey: BATCH_SIZE_KEY, value: 100 },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 3_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "circuit-breaker" },
      ]);
      expect(state.transitions.incidentState).toBe("consumer-b-outstanding");
      expect(state.values.consumerBLagMessages).toBeGreaterThan(5_000);
      expect(state.values.topicADurabilityPct).toBe(100);
    });

    it("fixing only the downstream leaves the broker and Consumer Group B problems exactly as bad", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: DOWNSTREAM_CIRCUIT_BREAKER_KEY, value: true },
      ]);
      expect(state.transitions.incidentState).toBe("broker-and-consumer-b-outstanding");
      expect(state.values.brokerPartitionHealth).toBeLessThan(70);
      expect(state.values.consumerBLagMessages).toBeGreaterThan(5_000);
    });
  });

  describe("Recovery lag: the safe combination relieves pressure but does not clear it instantly", () => {
    it("immediately after applying the correct controls, the system is draining, not yet fully recovered", () => {
      const justAfter = runScenario(CONSUMER_C_RETRY_STORM_MS + 10_000, SAFE_ACTIONS);
      expect(justAfter.transitions.incidentState).toBe("all-mitigated-draining");
      expect(justAfter.values.consumerBLagMessages).toBeGreaterThan(100);
      expect(justAfter.values.downstreamHealthPct).toBeLessThan(90);
    });

    it("only after every real elapsed recovery window has the system fully recovered", () => {
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      const drained = runScenario(lastWindow + 5_000, SAFE_ACTIONS);
      expect(drained.transitions.incidentState).toBe("all-mitigated-recovered");
      expect(drained.values.consumerBLagMessages).toBeLessThanOrEqual(100);
      expect(drained.values.downstreamHealthPct).toBeGreaterThanOrEqual(90);
    });

    it("the drained state is reached strictly later in simulated time than the draining state for the same controls", () => {
      const draining = runScenario(CONSUMER_C_RETRY_STORM_MS + 10_000, SAFE_ACTIONS);
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      const drained = runScenario(lastWindow + 5_000, SAFE_ACTIONS);
      expect(draining.transitions.incidentState).toBe("all-mitigated-draining");
      expect(drained.transitions.incidentState).toBe("all-mitigated-recovered");
    });
  });

  describe("Multi-step path", () => {
    it("a candidate who applies all four safe controls in sequence reaches the fully-recovered optimal state, once sustained", () => {
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      // successCondition requires sustainedSeconds=20 -- run well past
      // the last recovery window for the sustain counter to accrue.
      const state = runScenario(lastWindow + 25_000, SAFE_ACTIONS);
      expect(state.numberOfConfigurationChanges).toBe(SAFE_ACTIONS.length);
      expect(state.numberOfHarmfulChanges).toBe(0);
      const eligibility = evaluateCompletionEligibility(eventPlatformPartialOutageSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued immediately at t=0 resolves to declared_unstable", () => {
      const state = createInitialState(eventPlatformPartialOutageSimulation);
      const result = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 30_000);
      const result = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion eligibility and scoring across executed paths", () => {
    it("OPTIMAL: the fully-recovered safe path is eligible at the optimal tier and scores well", () => {
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      const state = runScenario(lastWindow + 25_000, SAFE_ACTIONS);
      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");

      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      expect(result.total).toBeGreaterThan(750);
      expect(result.breakdown.dataIntegrity).toBe(200);
    });

    it("ACCEPTABLE: the draining-but-bounded safe path is eligible at the acceptable tier", () => {
      // acceptableCondition requires sustainedSeconds=20 too -- run
      // past the last SAFE_ACTIONS change (storm+4s) but well before
      // any recovery window fires, so the draining rule is sustained
      // long enough without ever reaching the fully-drained state.
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 30_000, SAFE_ACTIONS);
      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("acceptable");

      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      expect(result.breakdown.dataIntegrity).toBe(200);
    });

    it("BASELINE: zero-action leaves the attempt unresolved and scores poorly", () => {
      const state = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000);
      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, state);
      expect(finish.outcome).toBe("declared_unstable");

      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      expect(result.breakdown.recovery).toBe(0);
      expect(result.breakdown.reliability).toBe(0);
    });

    it("HARMFUL: the Topic A contamination path scores materially worse on dataIntegrity despite looking contained elsewhere", () => {
      const contaminated = runScenario(TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 10_000, [
        ...TOPIC_A_CONTAMINATION_ACTIONS,
        { atMs: TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 5_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
        { atMs: TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 6_000, controlKey: BATCH_SIZE_KEY, value: 100 },
      ]);
      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, contaminated);
      expect(finish.outcome).toBe("declared_unstable");

      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      // Unresolved terminal override applies to recovery/reliability;
      // dataIntegrity has no terminalOverrides, so it is measured off
      // the live platformStatus="critical" snapshot regardless of
      // resolution outcome.
      expect(result.breakdown.dataIntegrity).toBe(20);
    });

    it("ALTERNATE STRONG PATH: downstream circuit breaker + bounded retries + DLQ reaches the same safe outcome via a different route", () => {
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      const alternateActions: TimedAction[] = [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: PARTITION_ISOLATION_KEY, value: "isolated" },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 2_000, controlKey: BATCH_SIZE_KEY, value: 100 },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 3_000, controlKey: CONSUMER_B_CONCURRENCY_KEY, value: 8 },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 4_000, controlKey: DOWNSTREAM_CIRCUIT_BREAKER_KEY, value: true },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 5_000, controlKey: CONSUMER_C_RETRY_MODE_KEY, value: "bounded" },
        { atMs: CONSUMER_C_RETRY_STORM_MS + 6_000, controlKey: DLQ_POLICY_KEY, value: "enabled" },
      ];
      const state = runScenario(lastWindow + 25_000, alternateActions);
      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, state);
      expect(finish.outcome).toBe("resolved");

      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      expect(result.breakdown.dataIntegrity).toBe(200);
    });
  });

  describe("Suspicious-score sanity checks", () => {
    it("harmful pressure-transfer scores strictly worse overall than the safe acceptable path at the same elapsed time", () => {
      const harmful = runScenario(CONSUMER_C_RETRY_STORM_MS + 10_000, [
        { atMs: CONSUMER_C_RETRY_STORM_MS + 1_000, controlKey: CONSUMER_B_CONCURRENCY_KEY, value: 16 },
      ]);
      const safe = runScenario(CONSUMER_C_RETRY_STORM_MS + 10_000, SAFE_ACTIONS);

      const harmfulFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, harmful);
      const safeFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, safe);

      const harmfulInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, harmfulFinish);
      const safeInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, safeFinish);

      const harmfulScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, harmfulInputs);
      const safeScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, safeInputs);

      expect(harmfulScore.total).toBeLessThan(safeScore.total);
    });

    it("no-action baseline never scores higher than the safe acceptable path", () => {
      const baseline = runScenario(CONSUMER_C_RETRY_STORM_MS + 10_000);
      const safe = runScenario(CONSUMER_C_RETRY_STORM_MS + 10_000, SAFE_ACTIONS);

      const baselineFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, baseline);
      const safeFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, safe);

      const baselineInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, baselineFinish);
      const safeInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, safeFinish);

      const baselineScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, baselineInputs);
      const safeScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, safeInputs);

      expect(baselineScore.total).toBeLessThan(safeScore.total);
    });

    it("an availability-good/correctness-bad path never scores near optimal on dataIntegrity", () => {
      const contaminated = runScenario(TOPIC_A_EXPOSURE_WINDOW_ELAPSED_MS + 2_000, TOPIC_A_CONTAMINATION_ACTIONS);
      const finish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, contaminated);
      const inputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, finish);
      const result = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, inputs);
      expect(result.breakdown.dataIntegrity).toBeLessThan(50);
    });

    it("acceptable never scores higher than optimal for the same control combination", () => {
      const acceptableState = runScenario(CONSUMER_C_RETRY_STORM_MS + 30_000, SAFE_ACTIONS);
      const lastWindow = Math.max(
        BROKER_RECOVERY_WINDOW_ELAPSED_MS,
        CONSUMER_B_DRAIN_WINDOW_ELAPSED_MS,
        DOWNSTREAM_RECOVERY_WINDOW_ELAPSED_MS,
      );
      const optimalState = runScenario(lastWindow + 25_000, SAFE_ACTIONS);

      const acceptableFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, acceptableState);
      const optimalFinish = evaluateCandidateDeclaredFinish(eventPlatformPartialOutageSimulation, optimalState);

      const acceptableInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, acceptableFinish);
      const optimalInputs = extractFinishScoringInputs(eventPlatformPartialOutageSimulation, optimalFinish);

      const acceptableScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, acceptableInputs);
      const optimalScore = scoreAuthoredAttempt(EVENT_PLATFORM_PARTIAL_OUTAGE_SCORING, optimalInputs);

      expect(acceptableScore.total).toBeLessThanOrEqual(optimalScore.total);
    });
  });

  describe("Determinism", () => {
    it("running the same safe action sequence twice produces identical final state", () => {
      const first = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, SAFE_ACTIONS);
      const second = runScenario(CONSUMER_C_RETRY_STORM_MS + 20_000, SAFE_ACTIONS);
      expect(first.values).toEqual(second.values);
      expect(first.transitions.incidentState).toEqual(second.transitions.incidentState);
    });
  });
});
