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
import { leaderElectionStorm } from "./leader-election-storm";
import {
  CLIENT_RETRY_BEHAVIOR_KEY,
  ELECTION_TIMEOUT_MS_KEY,
  FLAKY_NODE_ISOLATED_KEY,
  HEARTBEAT_INTERVAL_MS_KEY,
  leaderElectionStormSimulation,
  QUORUM_VOTING_SET_SIZE_KEY,
} from "./leader-election-storm/definition";
import { leaderElectionStormCandidateUI } from "./leader-election-storm/candidate-ui";
import { LEADER_ELECTION_STORM_SCORING } from "./leader-election-storm/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(leaderElectionStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += leaderElectionStormSimulation.tickMs
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
      leaderElectionStormSimulation,
      state,
      action,
      leaderElectionStormSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const JITTER_STARTS_MS = 30_000;
const NODE3_DEGRADING_MS = JITTER_STARTS_MS + 3 * 60_000;
const GENUINE_CRASH_MS = NODE3_DEGRADING_MS + 60_000;
const CRASH_SETTLED_MS = GENUINE_CRASH_MS + 30_000;

describe("Leader Election Storm", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid staff scenario", () => {
      expect(leaderElectionStorm.isFree).toBe(false);
      expect(leaderElectionStorm.library?.category).toBe("Distributed Systems");
      expect(leaderElectionStorm.library?.tags.length).toBeGreaterThan(0);
      expect(leaderElectionStorm.library?.skills.length).toBeGreaterThan(0);
      expect(leaderElectionStorm.difficulty).toBe("staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = LEADER_ELECTION_STORM_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = LEADER_ELECTION_STORM_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, 4-8 controls, and components", () => {
      expect(leaderElectionStormCandidateUI.metrics.length).toBeGreaterThan(0);
      expect(leaderElectionStormCandidateUI.controls.length).toBeGreaterThanOrEqual(4);
      expect(leaderElectionStormCandidateUI.controls.length).toBeLessThanOrEqual(8);
      expect(leaderElectionStormCandidateUI.components.length).toBeGreaterThan(0);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(leaderElectionStormSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.electionStabilityMechanism).toBe("unresolved");
    });

    it("jitter onset with no mitigation produces spurious elections (default client retry behavior is aggressive)", () => {
      const state = runScenario(JITTER_STARTS_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(JITTER_STARTS_MS);
      expect(state.status).toBe("critical");
      expect(state.values.leaderChangesPerMinute).toBe(40);
      expect(state.values.quorumHealth).toBe("critical");
    });

    it("strong path: raising the timeout to 1200ms with a tight heartbeat interval stabilizes the cluster", () => {
      const state = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.quorumHealth).toBe("normal");
      expect(state.values.electionStabilityMechanism).toBe("margin-fixed");
    });

    it("alternate good path: isolating the flaky node stabilizes the cluster regardless of timeout", () => {
      const state = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: FLAKY_NODE_ISOLATED_KEY, value: true },
      ]);
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.quorumHealth).toBe("no-slack");
      expect(state.values.electionStabilityMechanism).toBe("node-isolated");
    });

    it("harmful/trap path: an excessively long timeout (3000ms) also looks quiet during jitter-only", () => {
      const state = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 3_000 },
      ]);
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.quorumHealth).toBe("normal");
      // Looks quiet, but never earns a real stability mechanism.
      expect(state.values.electionStabilityMechanism).toBe("unresolved");
    });

    it("harmful path: widening the heartbeat interval at 1200ms leaves residual spurious elections", () => {
      const state = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: HEARTBEAT_INTERVAL_MS_KEY, value: 200 },
      ]);
      expect(state.values.leaderChangesPerMinute).toBe(3);
      expect(state.values.quorumHealth).toBe("warning");
    });

    it("harmful path: aggressive client retries (the default) amplify throughput collapse more than backoff during spurious elections", () => {
      const aggressive = runScenario(JITTER_STARTS_MS + 20_000);
      const backoff = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: CLIENT_RETRY_BEHAVIOR_KEY, value: "backoff" },
      ]);
      expect(aggressive.values.clusterThroughputRps).toBeLessThan(
        backoff.values.clusterThroughputRps as number,
      );
      expect(aggressive.values.requestFailureRate).toBeGreaterThan(
        backoff.values.requestFailureRate as number,
      );
    });

    it("harmful path: widening the voting set alone does not fix the jitter and adds overhead", () => {
      const baseline = runScenario(JITTER_STARTS_MS + 20_000);
      const widened = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: QUORUM_VOTING_SET_SIZE_KEY, value: 5 },
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: CLIENT_RETRY_BEHAVIOR_KEY, value: "aggressive" },
      ]);
      expect(widened.values.leaderChangesPerMinute).toBeGreaterThan(
        baseline.values.leaderChangesPerMinute as number,
      );
      expect(widened.values.quorumHealth).toBe("critical");
    });

    it("baseline (no action) stays critical and never self-resolves", () => {
      const state = runScenario(JITTER_STARTS_MS + 60_000);
      expect(state.status).toBe("critical");
      expect(state.values.quorumHealth).toBe("critical");
    });

    it("delayed consequence: node3HeartbeatMissStreak rises as an observable precursor before the genuine crash", () => {
      const beforeDegrading = runScenario(NODE3_DEGRADING_MS - 1_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(beforeDegrading.values.node3HeartbeatMissStreak).toBe(0);

      const afterDegrading = runScenario(NODE3_DEGRADING_MS + 1_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      // Precursor visible well before the crash: the miss streak has
      // risen even though the cluster is otherwise still fully stable.
      expect(afterDegrading.values.node3HeartbeatMissStreak).toBe(30);
      expect(afterDegrading.values.leaderChangesPerMinute).toBe(0);

      const afterCrash = runScenario(GENUINE_CRASH_MS + 1_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(afterCrash.values.failureDetectionTimeMs).toBe(1_350);
    });

    it("the margin-fixed timeout detects a genuine crash fast and settles safely (reduced redundancy)", () => {
      const state = runScenario(CRASH_SETTLED_MS + 5_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.quorumHealth).toBe("no-slack");
      expect(state.values.electionStabilityMechanism).toBe("margin-fixed");
    });

    it("the excessive timeout detects the same genuine crash much more slowly", () => {
      const midFailover = runScenario(GENUINE_CRASH_MS + 1_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 3_000 },
      ]);
      expect(midFailover.values.failureDetectionTimeMs).toBe(3_400);
      expect(midFailover.values.clusterThroughputRps).toBe(310);

      const marginFixedMidFailover = runScenario(GENUINE_CRASH_MS + 1_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(midFailover.values.failureDetectionTimeMs).toBeGreaterThan(
        marginFixedMidFailover.values.failureDetectionTimeMs as number,
      );
      expect(midFailover.values.clusterThroughputRps).toBeLessThan(
        marginFixedMidFailover.values.clusterThroughputRps as number,
      );
    });

    it("the isolation path is fully unaffected by node-3's eventual genuine crash", () => {
      const state = runScenario(GENUINE_CRASH_MS + 1_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: FLAKY_NODE_ISOLATED_KEY, value: true },
      ]);
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.quorumHealth).toBe("no-slack");
      expect(state.values.electionStabilityMechanism).toBe("node-isolated");
    });

    it("compounding failure path: spurious elections plus the real crash is the worst observed state", () => {
      const state = runScenario(GENUINE_CRASH_MS + 1_000);
      expect(state.values.quorumHealth).toBe("critical");
      expect(state.values.leaderChangesPerMinute).toBeGreaterThan(0);
    });

    it("fails if quorumHealth stays critical for the full sustained window", () => {
      const state = runScenario(JITTER_STARTS_MS + 91_000);
      expect(state.status).toBe("failed");
      expect(state.failedAtMs).not.toBeNull();
    });

    it("tracks peak leader changes generically via numericWatchFields", () => {
      const state = runScenario(JITTER_STARTS_MS + 1_000);
      expect(state.peaks.peakValues.leaderChangesPerMinute).toBe(40);
    });

    it("tracks monthly infrastructure cost that increases with a widened voting set", () => {
      let state = createInitialState(leaderElectionStormSimulation);
      expect(state.cost.currentMonthlyCostUsd).toBe(300);

      state = simulate(
        leaderElectionStormSimulation,
        state,
        { id: "widen-quorum", timestampMs: 0, controlKey: QUORUM_VOTING_SET_SIZE_KEY, value: 5 },
        leaderElectionStormSimulation.tickMs,
      ).state;

      expect(state.cost.currentMonthlyCostUsd).toBe(300 + 180);
    });
  });

  describe("Phase 6.1: two-tier completion — margin-fixed (optimal) vs node-isolated (acceptable)", () => {
    it("margin-fixed, sustained, is eligible for an OPTIMAL-tier Finish", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(leaderElectionStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("node-isolated, sustained, is eligible for an ACCEPTABLE-tier Finish — a legitimate handback, not a trap", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: FLAKY_NODE_ISOLATED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(leaderElectionStormSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("excessive timeout, quiet but unproven, remains ineligible for any Finish tier", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 3_000 },
      ]);
      expect(state.status).not.toBe("resolved");
      const eligibility = evaluateCompletionEligibility(leaderElectionStormSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("CORRECTNESS-ADJACENT: excessive timeout stays ineligible even after settling post-crash, despite healthy-looking availability metrics", () => {
      const state = runScenario(CRASH_SETTLED_MS + 5_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 3_000 },
      ]);
      // Availability metrics look fully healthy...
      expect(state.values.leaderChangesPerMinute).toBe(0);
      expect(state.values.requestFailureRate).toBe(1);
      expect(state.values.clusterThroughputRps).toBe(1_000);
      // ...but the real field proving the fix was never proportionate
      // stays "unresolved", and Finish must not reward it.
      expect(state.values.electionStabilityMechanism).toBe("unresolved");
      const eligibility = evaluateCompletionEligibility(leaderElectionStormSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
      const result = evaluateCandidateDeclaredFinish(leaderElectionStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("success does not auto-terminal even when sustained (candidate must declare Finish)", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveSuccessSeconds).toBeGreaterThanOrEqual(
        leaderElectionStormSimulation.successCondition.sustainedSeconds,
      );
    });

    it("acceptable does not auto-terminal even when sustained", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: FLAKY_NODE_ISOLATED_KEY, value: true },
      ]);
      expect(state.status).not.toBe("resolved");
      expect(state.resolvedAtMs).toBeNull();
      expect(state.transitions.consecutiveAcceptableSeconds).toBeGreaterThanOrEqual(
        leaderElectionStormSimulation.completion!.acceptableCondition!.sustainedSeconds,
      );
    });

    it("Finish from optimal -> resolved/optimal", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      const result = evaluateCandidateDeclaredFinish(leaderElectionStormSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("Finish from acceptable -> resolved/acceptable", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: FLAKY_NODE_ISOLATED_KEY, value: true },
      ]);
      const result = evaluateCandidateDeclaredFinish(leaderElectionStormSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("acceptable");
    });

    it("Finish from unsafe (baseline, no mitigation) -> declared_unstable", () => {
      const state = runScenario(JITTER_STARTS_MS + 25_000);
      const result = evaluateCandidateDeclaredFinish(leaderElectionStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("automatic failure still fires regardless of candidate_declared mode", () => {
      const state = runScenario(JITTER_STARTS_MS + 91_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(leaderElectionStormSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const actions: TimedAction[] = [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ];
      const runA = runScenario(JITTER_STARTS_MS + 25_000, actions);
      const runB = runScenario(JITTER_STARTS_MS + 25_000, actions);
      expect(runA).toEqual(runB);
    });

    it("produces identical state across the full crash-and-settle window run twice", () => {
      const actions: TimedAction[] = [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ];
      const runA = runScenario(CRASH_SETTLED_MS + 5_000, actions);
      const runB = runScenario(CRASH_SETTLED_MS + 5_000, actions);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores good (margin-fixed), acceptable (node-isolated), baseline, and harmful (excessive timeout) paths", () => {
      const goodState = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 1_200 },
      ]);
      const goodFinish = evaluateCandidateDeclaredFinish(leaderElectionStormSimulation, goodState);
      const goodScore = scoreAuthoredAttempt(
        LEADER_ELECTION_STORM_SCORING,
        extractFinishScoringInputs(leaderElectionStormSimulation, goodFinish),
      );

      const acceptableState = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: FLAKY_NODE_ISOLATED_KEY, value: true },
      ]);
      const acceptableFinish = evaluateCandidateDeclaredFinish(
        leaderElectionStormSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        LEADER_ELECTION_STORM_SCORING,
        extractFinishScoringInputs(leaderElectionStormSimulation, acceptableFinish),
      );

      // Baseline/harmful paths never reach Finish eligibility — score
      // them as never-resolved attempts via the unresolved terminal
      // override (no synthetic resolvedAtMs is ever fabricated).
      const baselineState = runScenario(JITTER_STARTS_MS + 25_000);
      const baselineScore = scoreAuthoredAttempt(
        LEADER_ELECTION_STORM_SCORING,
        extractScoringInputs(leaderElectionStormSimulation, baselineState),
      );

      const harmfulState = runScenario(JITTER_STARTS_MS + 25_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 3_000 },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        LEADER_ELECTION_STORM_SCORING,
        extractScoringInputs(leaderElectionStormSimulation, harmfulState),
      );

      // Executed, actual numbers — read and asserted exactly, not assumed.
      expect(goodScore.total).toBe(865);
      expect(acceptableScore.total).toBe(825);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(535);

      // dataIntegrity is the dimension that discriminates optimal from
      // acceptable; both reach full marks on every other resolved-path
      // dimension at this identical, near-instant recovery time (the
      // pre-existing criticalTimeRatio-floor artifact, also present in
      // Missing Database Index and Distributed Lock Failure, caps
      // reliability at its lowest band for both regardless).
      expect(goodScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(160);
      expect(goodScore.breakdown.reliability).toBe(15);
      expect(acceptableScore.breakdown.reliability).toBe(15);
      expect(goodScore.total).toBeGreaterThan(acceptableScore.total);

      // Baseline/harmful never resolve, so recovery and reliability are
      // both zeroed by terminalOverrides — the resolved paths above
      // earn full points on both, which the unresolved paths never can
      // regardless of how little revenue/cost they happened to accrue
      // in this short a window.
      expect(baselineScore.breakdown.recovery).toBe(0);
      expect(baselineScore.breakdown.reliability).toBe(0);
      expect(harmfulScore.breakdown.recovery).toBe(0);
      expect(harmfulScore.breakdown.reliability).toBe(0);
      expect(goodScore.breakdown.recovery).toBeGreaterThan(baselineScore.breakdown.recovery);

      // The harmful path (excessive timeout) is penalized relative to
      // baseline (no action) purely on operationalEfficiency — raising
      // the timeout is an authored harmful change in this jitter-only
      // window, since it never earns a real stability mechanism.
      expect(harmfulScore.breakdown.operationalEfficiency).toBeLessThan(
        baselineScore.breakdown.operationalEfficiency,
      );
    });

    it("harmful action classifications are recorded for the excessive timeout and aggressive retries", () => {
      const state = runScenario(JITTER_STARTS_MS + 20_000, [
        { atMs: JITTER_STARTS_MS + 1_000, controlKey: ELECTION_TIMEOUT_MS_KEY, value: 3_000 },
        { atMs: JITTER_STARTS_MS + 2_000, controlKey: CLIENT_RETRY_BEHAVIOR_KEY, value: "aggressive" },
      ]);
      expect(state.numberOfHarmfulChanges).toBeGreaterThanOrEqual(1);
    });
  });
});
