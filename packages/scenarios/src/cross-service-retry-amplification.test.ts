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
import { crossServiceRetryAmplification } from "./cross-service-retry-amplification";
import {
  CANCELLATION_PROPAGATION_KEY,
  CIRCUIT_BREAKER_KEY,
  crossServiceRetryAmplificationSimulation,
  GATEWAY_RETRIES_KEY,
  SERVICE_A_RETRIES_KEY,
  SERVICE_B_RETRIES_KEY,
  SERVICE_C_RETRIES_KEY,
  SERVICE_C_TIMEOUT_SECONDS_KEY,
} from "./cross-service-retry-amplification/definition";
import { crossServiceRetryAmplificationCandidateUI } from "./cross-service-retry-amplification/candidate-ui";
import { CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING } from "./cross-service-retry-amplification/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(crossServiceRetryAmplificationSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += crossServiceRetryAmplificationSimulation.tickMs
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
      crossServiceRetryAmplificationSimulation,
      state,
      action,
      crossServiceRetryAmplificationSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const INCIDENT_START_MS = 60_000;
const SECOND_WAVE_MS = INCIDENT_START_MS + 4 * 60_000;

describe("Cross-Service Retry Amplification", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(crossServiceRetryAmplification.isFree).toBe(false);
      expect(crossServiceRetryAmplification.library?.category).toBe("Microservices & Dependencies");
      expect(crossServiceRetryAmplification.library?.tags.length).toBeGreaterThan(0);
      expect(crossServiceRetryAmplification.library?.skills.length).toBeGreaterThan(0);
      expect(crossServiceRetryAmplification.difficulty).toBe("senior_staff");
    });

    it("states candidate-visible business invariants explicitly in the description", () => {
      const description = crossServiceRetryAmplification.description;
      expect(description).toContain("exactly one controlled ownership boundary");
      expect(description).toContain("must be protected from multiplicative amplification");
      expect(description).toContain("Cancellation and timeout propagation should prevent zombie work");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls (4-8), and components", () => {
      expect(crossServiceRetryAmplificationCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(crossServiceRetryAmplificationCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(crossServiceRetryAmplificationCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(crossServiceRetryAmplificationCandidateUI.components.length).toBe(6);
    });

    it("has a flat architecture of six nodes and five edges", () => {
      expect(crossServiceRetryAmplificationSimulation.architecture.nodes.length).toBe(6);
      expect(crossServiceRetryAmplificationSimulation.architecture.edges.length).toBe(5);
    });

    it("is authored as candidate_declared completion with a real acceptable tier", () => {
      expect(crossServiceRetryAmplificationSimulation.completion?.mode).toBe("candidate_declared");
      expect(crossServiceRetryAmplificationSimulation.completion?.acceptableCondition).toBeDefined();
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(crossServiceRetryAmplificationSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.effectiveAmplificationFactor).toBe(1);
      expect(state.values.retryOwnershipMode).toBe("unowned");
    });

    it("provider degradation triggers the unowned baseline-critical incident with real amplification", () => {
      const state = runScenario(INCIDENT_START_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(INCIDENT_START_MS);
      expect(state.status).toBe("critical");
      // 4 default retry layers at 2 retries each: (1+2)^4 = 81x.
      expect(state.values.effectiveAmplificationFactor).toBe(81);
      expect(state.values.retryOwnershipMode).toBe("unowned");
    });

    it("strong path: consolidating retry ownership at Service C with breaker + cancellation reaches the fully safe state", () => {
      const state = runScenario(INCIDENT_START_MS + 40_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
      ]);
      expect(state.values.retryOwnershipMode).toBe("owned-service-c");
      expect(state.values.effectiveAmplificationFactor).toBe(3);
      expect(state.values.zombieRequestCount).toBeLessThanOrEqual(20);
      expect(state.values.customerSuccessRate).toBeGreaterThanOrEqual(95);
    });

    it("alternate acceptable path: ownership consolidated but breaker not yet enabled", () => {
      const state = runScenario(INCIDENT_START_MS + 40_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
      ]);
      expect(state.values.retryOwnershipMode).toBe("owned-service-c");
      expect(state.values.effectiveAmplificationFactor).toBe(3);
      expect(state.transitions.incidentState).toBe("owned-no-breaker");
    });

    it("harmful/tempting pressure-transfer path: reducing retries at Gateway alone leaves amplification persisting through the other layers", () => {
      const baseline = runScenario(INCIDENT_START_MS + 20_000);
      const gatewayOnly = runScenario(INCIDENT_START_MS + 20_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
      ]);

      // Real relief versus baseline (81 -> 27)...
      expect(gatewayOnly.values.effectiveAmplificationFactor).toBeLessThan(
        baseline.values.effectiveAmplificationFactor as number,
      );
      expect(gatewayOnly.values.effectiveAmplificationFactor).toBe(27);
      // ...but nowhere near the bounded-safe ceiling (<=3), proving
      // amplification persisted through Service A/B/C rather than being
      // eliminated — the authored incomplete-relief trap.
      expect(gatewayOnly.values.effectiveAmplificationFactor).toBeGreaterThan(3);
      expect(gatewayOnly.values.retryOwnershipMode).toBe("partial-gateway-only");
      expect(gatewayOnly.status).toBe("critical");
    });

    it("harmful path: increasing retries at every layer simultaneously makes amplification worse than baseline", () => {
      const baseline = runScenario(INCIDENT_START_MS + 20_000);
      const everywhereMore = runScenario(INCIDENT_START_MS + 20_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_C_RETRIES_KEY, value: 3 },
      ]);

      expect(everywhereMore.values.effectiveAmplificationFactor).toBeGreaterThan(
        baseline.values.effectiveAmplificationFactor as number,
      );
      expect(everywhereMore.values.effectiveAmplificationFactor).toBe(256);
      expect(everywhereMore.values.customerSuccessRate).toBeLessThan(
        baseline.values.customerSuccessRate as number,
      );
    });

    it("delayed consequence: left unmitigated, the second-wave timer deepens provider degradation with a visible precursor already elevated", () => {
      const beforeSecondWave = runScenario(SECOND_WAVE_MS - 1_000);
      const afterSecondWave = runScenario(SECOND_WAVE_MS + 1_000);

      // Precursor: provider latency and connection utilization were
      // already elevated before the second wave — never a surprise
      // flip from a healthy-looking state.
      expect(beforeSecondWave.values.providerLatencyMs).toBeGreaterThan(220);
      expect(beforeSecondWave.values.providerConnectionUtilizationPercent).toBeGreaterThan(35);
      expect(afterSecondWave.values.providerLatencyMs).toBeGreaterThan(
        beforeSecondWave.values.providerLatencyMs as number,
      );
    });

    it("recovery lag: connection-pool backlog from the unresolved period drains over real elapsed time rather than snapping instantly to its floor", () => {
      const fixedActions = [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
      ];
      // Shortly after every control change has landed, ownership is
      // already correctly consolidated (bounded amplification) but the
      // connection-pool backlog built up during the unresolved window
      // has not yet drained — in-flight/zombie pressure is still
      // elevated above the topology's own steady-state numbers.
      const shortlyAfterFix = runScenario(INCIDENT_START_MS + 10_000, fixedActions);
      expect(shortlyAfterFix.transitions.incidentState).toBe("owned-backlog-draining");
      expect(shortlyAfterFix.values.effectiveAmplificationFactor).toBe(3);

      // Well after the authored drain window has passed, the SAME
      // topology reaches the fully-drained steady state — strictly
      // lower in-flight/zombie pressure than immediately after the fix,
      // proving real elapsed-time decay rather than an instant snap.
      const wellAfterFix = runScenario(INCIDENT_START_MS + 100_000, fixedActions);
      expect(wellAfterFix.transitions.incidentState).toBe("owned-fully-safe");
      expect(wellAfterFix.values.inFlightRequests).toBeLessThan(
        shortlyAfterFix.values.inFlightRequests as number,
      );
      expect(wellAfterFix.values.zombieRequestCount).toBeLessThan(
        shortlyAfterFix.values.zombieRequestCount as number,
      );
    });

    it("recovery lag additionally delays Finish eligibility: the backlog-draining state is not yet sustained-eligible even though the topology is already correct", () => {
      const fixedActions = [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
      ];
      const duringBacklogDrain = runScenario(INCIDENT_START_MS + 10_000, fixedActions);
      expect(duringBacklogDrain.transitions.incidentState).toBe("owned-backlog-draining");
      expect(duringBacklogDrain.transitions.consecutiveSuccessSeconds).toBe(0);
    });
  });

  describe("Multi-step", () => {
    it("first mitigation (Gateway stands down) produces a visible secondary consequence (amplification 81 -> 27, still unsafe), then a second mitigation (Service A stands down) continues the improvement", () => {
      const first = runScenario(INCIDENT_START_MS + 10_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
      ]);
      expect(first.values.effectiveAmplificationFactor).toBe(27);

      const second = runScenario(INCIDENT_START_MS + 10_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 2_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
      ]);
      // 1*1*3*3 = 9 — a further real improvement, but still above the
      // bounded-safe ceiling of 3 because Service B still retries.
      expect(second.values.effectiveAmplificationFactor).toBe(9);
      expect(second.values.effectiveAmplificationFactor).toBeLessThan(
        first.values.effectiveAmplificationFactor as number,
      );
    });
  });

  describe("Sequencing", () => {
    it("safe sequence: choosing the retry owner first, then hardening with breaker/cancellation, reaches the fully safe state", () => {
      const state = runScenario(INCIDENT_START_MS + 20_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 2_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: INCIDENT_START_MS + 3_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
      ]);
      expect(state.values.retryOwnershipMode).toBe("owned-service-c");
      expect(state.values.effectiveAmplificationFactor).toBe(3);
      expect(state.values.customerSuccessRate).toBeGreaterThanOrEqual(95);
    });

    it("unsafe sequence: tuning Service C's timeout aggressively BEFORE choosing a retry owner leaves amplification unresolved and customer success unimproved", () => {
      const baseline = runScenario(INCIDENT_START_MS + 20_000);
      const timeoutFirst = runScenario(INCIDENT_START_MS + 20_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_C_TIMEOUT_SECONDS_KEY, value: 1 },
      ]);

      // Amplification is NOT resolved by timeout tuning alone — it stays
      // at (roughly) the same multiplicatively-amplified order of
      // magnitude as doing nothing, because no layer has stood down.
      // Tuning timeout/circuit-breaking before choosing a retry owner is
      // the authored unsafe sequence: it does not address the dominant
      // mechanism (retry ownership), so the chain remains critical and
      // customer success does not meaningfully improve over baseline —
      // whatever a lower in-flight count might superficially suggest.
      expect(timeoutFirst.values.retryOwnershipMode).toBe("unowned");
      expect(timeoutFirst.values.effectiveAmplificationFactor).toBeGreaterThan(50);
      expect(timeoutFirst.values.customerSuccessRate).toBeLessThanOrEqual(
        baseline.values.customerSuccessRate as number,
      );
      expect(timeoutFirst.status).toBe("critical");
    });
  });

  describe("Completion", () => {
    it("fully safe path is eligible for an OPTIMAL-tier Finish", () => {
      // Must run past the backlog-drain window (20s after incident
      // start) plus the 30s success sustain window.
      const state = runScenario(INCIDENT_START_MS + 55_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
      ]);
      const eligibility = evaluateCompletionEligibility(crossServiceRetryAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });

      const result = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("ownership consolidated but breaker not yet applied is eligible for an ACCEPTABLE-tier Finish — a real, bounded handback, not a trap", () => {
      const state = runScenario(INCIDENT_START_MS + 40_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
      ]);
      const eligibility = evaluateCompletionEligibility(crossServiceRetryAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });

      const result = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("single-layer relief alone (the incomplete-relief trap) remains ineligible for any Finish tier", () => {
      const state = runScenario(INCIDENT_START_MS + 40_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
      ]);
      const eligibility = evaluateCompletionEligibility(crossServiceRetryAmplificationSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("Finish from the unowned baseline (no mitigation) -> declared_unstable", () => {
      const state = runScenario(INCIDENT_START_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("Finish from the harmful increase-retries-everywhere path -> declared_unstable", () => {
      const state = runScenario(INCIDENT_START_MS + 20_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_C_RETRIES_KEY, value: 3 },
      ]);
      const result = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    // ── Immediate-Finish audit (phase6dsupport.md section 11) ─────────
    // Incident triggered, zero candidate actions, Finish immediately.
    // Expected default: declared_unstable. This scenario produces
    // exactly that default — the unowned baseline is reached the moment
    // the incident starts, and no sustain window has had time to
    // accumulate, so there is no semantic justification needed for a
    // different outcome.
    it("immediate zero-action Finish right after incident start does not resolve prematurely", () => {
      const state = runScenario(INCIDENT_START_MS + 1_000);
      expect(state.transitions.consecutiveSuccessSeconds).toBe(0);
      expect(state.transitions.consecutiveAcceptableSeconds).toBe(0);

      const result = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("automatic failure still wins over any Finish declaration once the failure condition is sustained", () => {
      const state = runScenario(INCIDENT_START_MS + 20_000 + 61_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_C_RETRIES_KEY, value: 3 },
      ]);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Scoring", () => {
    it("scores optimal highest, then acceptable, then the incomplete-relief trap (a real partial decision), then baseline/harmful lowest", () => {
      // Must run past the backlog-drain window (20s after incident
      // start) plus the 30s success sustain window for a genuine
      // optimal-tier Finish.
      const optimalState = runScenario(INCIDENT_START_MS + 55_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: CANCELLATION_PROPAGATION_KEY, value: "on" },
      ]);
      const acceptableState = runScenario(INCIDENT_START_MS + 35_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
      ]);
      const baselineState = runScenario(INCIDENT_START_MS + 35_000);
      const trapState = runScenario(INCIDENT_START_MS + 35_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
      ]);
      const harmfulState = runScenario(INCIDENT_START_MS + 35_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_C_RETRIES_KEY, value: 3 },
      ]);

      const optimalFinish = evaluateCandidateDeclaredFinish(crossServiceRetryAmplificationSimulation, optimalState);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        crossServiceRetryAmplificationSimulation,
        acceptableState,
      );

      const optimalScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractFinishScoringInputs(crossServiceRetryAmplificationSimulation, optimalFinish),
      );
      const acceptableScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractFinishScoringInputs(crossServiceRetryAmplificationSimulation, acceptableFinish),
      );
      // Baseline/trap/harmful never reach Finish eligibility, so they
      // are scored as unresolved/never-finished attempts (the generic
      // terminalOverrides.unresolved path) off raw state, matching how
      // an attempt that simply never Finished would be scored.
      const baselineScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, baselineState),
      );
      const trapScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, trapState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, harmfulState),
      );

      expect(optimalScore.total).toBeGreaterThan(acceptableScore.total);
      expect(acceptableScore.total).toBeGreaterThan(trapScore.total);
      // The incomplete-relief trap is a REAL partial ownership decision
      // (one layer correctly stood down) — it legitimately scores
      // better than doing nothing at all, even though it remains
      // critical and ineligible for any Finish tier. This is a genuine,
      // earned distinction (dataIntegrity rewards "a real, if
      // incomplete, ownership decision" over "no decision at all"),
      // not an accidental inversion.
      expect(trapScore.total).toBeGreaterThan(baselineScore.total);
      expect(baselineScore.total).toBeGreaterThanOrEqual(harmfulScore.total);

      // Record the actual executed numbers (regression guard against
      // silent future drift in rules/scoring/extraction).
      expect(optimalScore.total).toBe(1000);
      expect(acceptableScore.total).toBe(940);
      expect(trapScore.total).toBe(480);
      expect(baselineScore.total).toBe(390);
      expect(harmfulScore.total).toBe(375);

      // dataIntegrity (repurposed as the retry-ownership-correctness
      // dimension) must discriminate three tiers: full ownership >
      // partial ownership decision > no ownership decision at all,
      // never tied.
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(200);
      expect(trapScore.breakdown.dataIntegrity).toBe(130);
      expect(baselineScore.breakdown.dataIntegrity).toBe(40);
      expect(harmfulScore.breakdown.dataIntegrity).toBe(40);

      // reliability (repurposed as the hardening-completeness
      // dimension) must discriminate full hardening from partial.
      expect(optimalScore.breakdown.reliability).toBe(150);
      expect(acceptableScore.breakdown.reliability).toBe(90);
    });

    it("harmful path never scores higher than baseline (sanity check against harmful scoring too high)", () => {
      const baselineState = runScenario(INCIDENT_START_MS + 35_000);
      const harmfulState = runScenario(INCIDENT_START_MS + 35_000, [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_A_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_B_RETRIES_KEY, value: 3 },
        { atMs: INCIDENT_START_MS + 1_000, controlKey: SERVICE_C_RETRIES_KEY, value: 3 },
      ]);

      const baselineScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, baselineState),
      );
      const harmfulScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, harmfulState),
      );

      expect(harmfulScore.total).toBeLessThanOrEqual(baselineScore.total);
    });

    it("zero-action immediate Finish scores no better than the baseline (sanity check against no-action score too high)", () => {
      const immediateState = runScenario(INCIDENT_START_MS + 1_000);
      const baselineState = runScenario(INCIDENT_START_MS + 35_000);

      const immediateScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, immediateState),
      );
      const baselineScore = scoreAuthoredAttempt(
        CROSS_SERVICE_RETRY_AMPLIFICATION_SCORING,
        extractScoringInputs(crossServiceRetryAmplificationSimulation, baselineState),
      );

      expect(immediateScore.total).toBeLessThanOrEqual(baselineScore.total);
      expect(immediateScore.breakdown.recovery).toBe(0);
    });
  });

  describe("Determinism", () => {
    it("identical actions + elapsed time produce identical state", () => {
      const actions: TimedAction[] = [
        { atMs: INCIDENT_START_MS + 1_000, controlKey: GATEWAY_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 2_000, controlKey: SERVICE_A_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 3_000, controlKey: SERVICE_B_RETRIES_KEY, value: 0 },
        { atMs: INCIDENT_START_MS + 4_000, controlKey: CIRCUIT_BREAKER_KEY, value: "on" },
      ];
      const first = runScenario(INCIDENT_START_MS + 50_000, actions);
      const second = runScenario(INCIDENT_START_MS + 50_000, actions);
      expect(first).toEqual(second);
    });
  });
});
