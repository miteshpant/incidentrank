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
import { hotShardReplicaLagFailoverRisk } from "./hot-shard-replica-lag-failover-risk";
import {
  API_CONCURRENCY_KEY,
  FAILOVER_SHARD2_KEY,
  HOT_TENANT_THROTTLE_KEY,
  READ_ROUTING_KEY,
  RECONCILE_STRANDED_WRITES_KEY,
  REPLICA_CATCHUP_PRIORITY_KEY,
  WRITE_THROTTLE_SHARD2_KEY,
  hotShardReplicaLagFailoverRiskSimulation,
} from "./hot-shard-replica-lag-failover-risk/definition";
import { hotShardReplicaLagFailoverRiskCandidateUI } from "./hot-shard-replica-lag-failover-risk/candidate-ui";
import { HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING } from "./hot-shard-replica-lag-failover-risk/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(hotShardReplicaLagFailoverRiskSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += hotShardReplicaLagFailoverRiskSimulation.tickMs
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
      hotShardReplicaLagFailoverRiskSimulation,
      state,
      action,
      hotShardReplicaLagFailoverRiskSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

const HOT_SHARD_ONSET_MS = 30_000;
const REPLICA_LAG_ONSET_MS = HOT_SHARD_ONSET_MS + 15_000;
const UNSAFE_FAILOVER_SUSTAINED_MS = REPLICA_LAG_ONSET_MS + 90_000;
const LAG_DRAIN_WINDOW_ELAPSED_MS = REPLICA_LAG_ONSET_MS + 3 * 60_000;
const RECONCILIATION_WINDOW_ELAPSED_MS = LAG_DRAIN_WINDOW_ELAPSED_MS + 4 * 60_000;

// Correct sequencing: contain the hot tenant first (strict throttle),
// then prioritize replica catch-up. No failover at all -- containment
// alone fully resolves the incident.
const CONTAINED_ACTIONS: TimedAction[] = [
  { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
  { atMs: REPLICA_LAG_ONSET_MS + 2_000, controlKey: REPLICA_CATCHUP_PRIORITY_KEY, value: "prioritized" },
];

// Correct sequencing including a failover: contain first, wait for the
// drain window, THEN promote only once safe.
const SAFE_FAILOVER_ACTIONS: TimedAction[] = [
  { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
  { atMs: LAG_DRAIN_WINDOW_ELAPSED_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
];

describe("Hot Shard + Replica Lag + Failover Risk", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid principal scenario", () => {
      expect(hotShardReplicaLagFailoverRisk.isFree).toBe(false);
      expect(hotShardReplicaLagFailoverRisk.library?.category).toBe("Distributed Systems");
      expect(hotShardReplicaLagFailoverRisk.library?.tags.length).toBeGreaterThan(0);
      expect(hotShardReplicaLagFailoverRisk.library?.skills.length).toBeGreaterThan(0);
      expect(hotShardReplicaLagFailoverRisk.difficulty).toBe("principal");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(hotShardReplicaLagFailoverRiskCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(hotShardReplicaLagFailoverRiskCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(hotShardReplicaLagFailoverRiskCandidateUI.components.length).toBe(11);
    });

    it("the architecture has exactly 11 flat nodes matching the spec", () => {
      expect(hotShardReplicaLagFailoverRiskSimulation.architecture.nodes.length).toBe(11);
      expect(hotShardReplicaLagFailoverRiskSimulation.architecture.edges.length).toBe(10);
    });

    it("the briefing explicitly states all four business invariants", () => {
      expect(hotShardReplicaLagFailoverRisk.description).toMatch(/acknowledged writes must not be lost/i);
      expect(hotShardReplicaLagFailoverRisk.description).toMatch(/temporary throttling of one tenant is acceptable/i);
      expect(hotShardReplicaLagFailoverRisk.description).toMatch(/stale reads may be tolerated only within the authored bound/i);
      expect(hotShardReplicaLagFailoverRisk.description).toMatch(/replica cannot become authoritative until it is sufficiently caught up/i);
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(hotShardReplicaLagFailoverRiskSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.shard2StrandedAcknowledgedWriteCount).toBe(0);
      expect(state.values.shard2FailoverSafety).toBe("safe");
    });

    it("hot-shard onset triggers the incident and raises Shard 2 Primary load while other shards stay flat", () => {
      const state = runScenario(HOT_SHARD_ONSET_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(HOT_SHARD_ONSET_MS);
      expect(state.values.shard2PrimaryRequestRate).toBeGreaterThan(1_000);
      expect(state.values.otherShardsPrimaryRequestRate).toBe(400);
    });

    it("replica lag onset independently begins after hot-shard onset, with no action taken", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 1_000);
      expect(state.values.shard2ReplicaLagSeconds).toBeGreaterThan(0);
      expect(state.values.shard2StrandedAcknowledgedWriteCount).toBe(0);
    });

    it("the replica's process health stays healthy even while lag is severe -- the misleading symptom", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000);
      expect(state.values.shard2ReplicaLagSeconds).toBeGreaterThan(0);
      expect(state.values.shard2ReplicaProcessHealthPct).toBe(100);
    });

    it("baseline (no action) stays unprotected: request rate, latency, and lag all nonzero, no correctness violation yet", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000);
      expect(state.transitions.incidentState).toBe("baseline-unmitigated");
      expect(state.values.shard2PrimaryQueueDepth).toBeGreaterThan(0);
      expect(state.values.shard2ReplicaLagSeconds).toBeGreaterThan(0);
      expect(state.values.shard2StrandedAcknowledgedWriteCount).toBe(0);
    });

    describe("Required pressure-transfer mechanism: scaling API concurrency worsens Shard 2 instead of helping", () => {
      it("harmful/tempting path: scaling API concurrency broadly makes Shard 2 Primary queue depth and latency measurably WORSE than the do-nothing baseline", () => {
        const before = runScenario(REPLICA_LAG_ONSET_MS + 20_000);

        const scaledState = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
        ]);

        expect(scaledState.values.shard2PrimaryQueueDepth as number).toBeGreaterThan(
          before.values.shard2PrimaryQueueDepth as number,
        );
        expect(scaledState.values.shard2PrimaryWriteLatencyMs as number).toBeGreaterThan(
          before.values.shard2PrimaryWriteLatencyMs as number,
        );
        // Other, previously-unaffected shards also show elevated
        // request rate purely from added connection overhead.
        expect(scaledState.values.otherShardsPrimaryRequestRate as number).toBeGreaterThan(400);
        expect(scaledState.transitions.incidentState).toBe("broad-scaling-worsened");

        // No correctness violation here -- a pure, real capacity
        // pressure-transfer trap, not a correctness trap.
        expect(scaledState.values.shard2StrandedAcknowledgedWriteCount).toBe(0);

        const eligibility = evaluateCompletionEligibility(hotShardReplicaLagFailoverRiskSimulation, scaledState);
        expect(eligibility).toEqual({ eligible: false });
      });
    });

    describe("Unsafe sequencing: failing over BEFORE lag drains creates real stranded-write loss", () => {
      it("unsafe sequence: failing over before the drain window produces a real, counted stranded-write violation", () => {
        const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
        ]);
        expect(state.values.shard2StrandedAcknowledgedWriteCount).toBeGreaterThan(0);
        expect(state.values.shard2FailoverSafety).toBe("unsafe-promotion");
      });

      it("safe sequence: containing the hot tenant and waiting for the drain window before failing over avoids any stranded writes at all", () => {
        const state = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 20_000, SAFE_FAILOVER_ACTIONS);
        expect(state.values.shard2StrandedAcknowledgedWriteCount).toBe(0);
        expect(state.values.shard2FailoverSafety).toBe("safe");
      });

      it("the stranded-write count keeps growing the longer an unsafe failover stays in effect -- real, climbing, ongoing damage", () => {
        const onset = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
        ]);
        const sustained = runScenario(UNSAFE_FAILOVER_SUSTAINED_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
        ]);
        expect(sustained.values.shard2StrandedAcknowledgedWriteCount as number).toBeGreaterThan(
          onset.values.shard2StrandedAcknowledgedWriteCount as number,
        );
      });

      it("fixing the live configuration back does NOT retroactively erase the historical stranded-write count already accrued", () => {
        const reversed = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
          { atMs: REPLICA_LAG_ONSET_MS + 10_000, controlKey: FAILOVER_SHARD2_KEY, value: false },
        ]);
        // Once failoverShard2 is flipped back to false, the CURRENT
        // rule match reverts to a non-failover state, but the real,
        // authored stranded-write snapshot while the unsafe rule was
        // matched is captured by the peak tracker and never zeroed.
        expect(reversed.peaks.peakValues.shard2StrandedAcknowledgedWriteCount).toBeGreaterThan(0);
      });
    });

    describe("Historical damage model: reconciliation drains the stranded-write backlog gradually, never resets it", () => {
      it("turning on reconciliation stops new stranded-write accumulation but does not zero the existing backlog instantly", () => {
        const reconciling = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
          { atMs: REPLICA_LAG_ONSET_MS + 2_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
          { atMs: REPLICA_LAG_ONSET_MS + 3_000, controlKey: RECONCILE_STRANDED_WRITES_KEY, value: "active" },
        ]);
        expect(reconciling.transitions.incidentState).toBe("unsafe-failover-reconciling-early");
        expect(reconciling.values.shard2StrandedAcknowledgedWriteCount).toBeGreaterThan(0);
        // Still correctness-unsafe: the promotion itself happened
        // unsafely and that fact never reverts, even while actively
        // reconciling.
        expect(reconciling.values.shard2FailoverSafety).toBe("unsafe-promotion");
      });

      it("after the real reconciliation window elapses, the backlog has genuinely drained further -- but still has not reset to zero merely from configuration", () => {
        const actions: TimedAction[] = [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
          { atMs: REPLICA_LAG_ONSET_MS + 2_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
          { atMs: REPLICA_LAG_ONSET_MS + 3_000, controlKey: RECONCILE_STRANDED_WRITES_KEY, value: "active" },
        ];
        const early = runScenario(REPLICA_LAG_ONSET_MS + 20_000, actions);
        const drained = runScenario(RECONCILIATION_WINDOW_ELAPSED_MS + 20_000, actions);

        expect(drained.transitions.incidentState).toBe("unsafe-failover-reconciling-drained");
        expect(drained.values.shard2StrandedAcknowledgedWriteCount as number).toBeLessThan(
          early.values.shard2StrandedAcknowledgedWriteCount as number,
        );
        expect(drained.values.shard2StrandedAcknowledgedWriteCount as number).toBeGreaterThan(0);
        // The mechanism itself remains unsafe -- reconciliation bounds
        // and drains the CONSEQUENCE, never retroactively makes the
        // original promotion safe.
        expect(drained.values.shard2FailoverSafety).toBe("unsafe-promotion");

        const eligibility = evaluateCompletionEligibility(hotShardReplicaLagFailoverRiskSimulation, drained);
        expect(eligibility).toEqual({ eligible: false });
      });

      it("without reconciliation ever being turned on, the stranded-write count never drains at all, no matter how much time passes", () => {
        const neverReconciled = runScenario(RECONCILIATION_WINDOW_ELAPSED_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
        ]);
        expect(neverReconciled.values.shard2StrandedAcknowledgedWriteCount).toBeGreaterThanOrEqual(85);
      });
    });

    describe("Stale read routing is its own violation, independent of failover", () => {
      it("allowing replica reads while lag is far outside the staleness bound is a real, distinct violation", () => {
        const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: READ_ROUTING_KEY, value: "replica-allowed" },
        ]);
        expect(state.transitions.incidentState).toBe("stale-read-routing-violation");
        // No write-authority change happened -- distinct from the
        // failover trap.
        expect(state.values.shard2FailoverSafety).toBe("safe");
      });
    });

    describe("Recovery lag: containment relieves pressure but lag does not clear instantly", () => {
      it("immediately after applying the correct contained-throttle controls, lag is lower than baseline but not yet fully caught up", () => {
        const justAfter = runScenario(REPLICA_LAG_ONSET_MS + 10_000, CONTAINED_ACTIONS);
        expect(justAfter.transitions.incidentState).toBe("contained-draining");
        expect(justAfter.values.shard2ReplicaLagSeconds).toBeGreaterThan(0);
      });

      it("only after the real elapsed drain window does the fully-caught-up state appear", () => {
        const drained = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, CONTAINED_ACTIONS);
        expect(drained.transitions.incidentState).toBe("contained-recovered");
        expect(drained.values.shard2ReplicaLagSeconds).toBeLessThanOrEqual(5);
      });

      it("the drained state is reached strictly later in simulated time than the draining state for the same control combination", () => {
        const draining = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS - 10_000, CONTAINED_ACTIONS);
        const drained = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, CONTAINED_ACTIONS);
        expect(draining.transitions.incidentState).toBe("contained-draining");
        expect(drained.transitions.incidentState).toBe("contained-recovered");
        expect(drained.values.shard2ReplicaLagSeconds as number).toBeLessThan(
          draining.values.shard2ReplicaLagSeconds as number,
        );
      });
    });

    describe("Multi-step path", () => {
      it("first mitigation (hot-tenant throttle) alone, without also engaging replica catch-up priority, does not yet reach the contained state", () => {
        const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
        ]);
        // This scenario's authored containment rule requires BOTH
        // levers together -- throttling the hot tenant alone is not
        // itself authored as a recognized mitigation combination, so
        // the incident remains at its baseline-unmitigated values.
        // This is intentional: it is what forces the candidate to
        // reason about the full containment sequence rather than
        // expecting partial credit for touching only one control.
        expect(state.transitions.incidentState).toBe("baseline-unmitigated");
        expect(state.values.shard2ReplicaLagSeconds).toBeGreaterThan(0);
      });

      it("second mitigation (replica catch-up priority) on top of the first reaches the contained-draining state", () => {
        const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, CONTAINED_ACTIONS);
        expect(state.transitions.incidentState).toBe("contained-draining");
      });

      it("third stage: waiting the real elapsed window completes recovery", () => {
        const state = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, CONTAINED_ACTIONS);
        expect(state.transitions.incidentState).toBe("contained-recovered");
      });
    });

    describe("Alternate strong path", () => {
      it("the moderate-throttle + write-throttle combination reaches a genuinely safe drained state via a different, also-legitimate tradeoff", () => {
        const alternateActions: TimedAction[] = [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "moderate" },
          { atMs: REPLICA_LAG_ONSET_MS + 2_000, controlKey: WRITE_THROTTLE_SHARD2_KEY, value: "on" },
          { atMs: REPLICA_LAG_ONSET_MS + 3_000, controlKey: REPLICA_CATCHUP_PRIORITY_KEY, value: "prioritized" },
        ];
        const alternateDrained = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, alternateActions);
        const primaryDrained = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, CONTAINED_ACTIONS);

        expect(alternateDrained.transitions.incidentState).toBe("alternate-moderate-throttle-recovered");
        expect(alternateDrained.values.shard2StrandedAcknowledgedWriteCount).toBe(0);
        // A real, different tradeoff: a higher sustained hot-tenant
        // traffic share than the primary strict-throttle path.
        expect(alternateDrained.values.shard2HotTenantTrafficSharePct as number).toBeGreaterThan(
          primaryDrained.values.shard2HotTenantTrafficSharePct as number,
        );
      });
    });

    describe("Automatic failure", () => {
      it("stays active (never auto-fails) even after the stranded-write backlog has been unsafely climbing past the old sustained window", () => {
        const state = runScenario(UNSAFE_FAILOVER_SUSTAINED_MS + 61_000, [
          { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
        ]);
        expect(state.status).not.toBe("failed");
        expect(state.failedAtMs).toBeNull();
        expect(state.transitions.consecutiveFailureSeconds).toBeGreaterThanOrEqual(
          60,
        );
      });
    });

    it("tracks peak stranded-write count and replica lag generically via numericWatchFields", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
      ]);
      expect(state.peaks.peakValues.shard2StrandedAcknowledgedWriteCount).toBeGreaterThan(0);
      expect(state.peaks.peakValues.shard2ReplicaLagSeconds).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts is moot: no incident has started yet", () => {
      const state = runScenario(HOT_SHARD_ONSET_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("a zero-action Finish issued well after the incident starts resolves to declared_unstable, never an accidental instant success", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000);
      const result = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("contained-draining is Finish-eligible as acceptable, not optimal", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 10_000 + 30_000, CONTAINED_ACTIONS);
      const eligibility = evaluateCompletionEligibility(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });

    it("contained-recovered (post drain window) is Finish-eligible as optimal", () => {
      const state = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 35_000, CONTAINED_ACTIONS);
      const eligibility = evaluateCompletionEligibility(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("an unsafe failover is never Finish-eligible at any tier, even while actively reconciling", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
        { atMs: REPLICA_LAG_ONSET_MS + 2_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "strict" },
        { atMs: REPLICA_LAG_ONSET_MS + 3_000, controlKey: RECONCILE_STRANDED_WRITES_KEY, value: "active" },
      ]);
      const eligibility = evaluateCompletionEligibility(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("the broad-API-scaling trap is never Finish-eligible at any tier", () => {
      const state = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      const eligibility = evaluateCompletionEligibility(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("Finish from the fully-drained contained path -> resolved/optimal", () => {
      const state = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 35_000, CONTAINED_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(result.outcome).toBe("resolved");
      expect(result.completionTier).toBe("optimal");
    });

    it("an unsafe failover left sustained well past the old sustained window still never resolves in candidate_declared mode (no auto-fail, but also never Finish-eligible)", () => {
      const state = runScenario(UNSAFE_FAILOVER_SUSTAINED_MS + 61_000, [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
      ]);
      expect(state.status).not.toBe("failed");
      expect(state.failedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, CONTAINED_ACTIONS);
      const runB = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 5_000, CONTAINED_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Scoring", () => {
    it("scores optimal, acceptable, alternate-strong, baseline, and harmful paths with coherent discrimination", () => {
      const optimalState = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 35_000, CONTAINED_ACTIONS);
      const optimalFinish = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
        extractFinishScoringInputs(hotShardReplicaLagFailoverRiskSimulation, optimalFinish),
      );

      const acceptableState = runScenario(REPLICA_LAG_ONSET_MS + 10_000 + 30_000, CONTAINED_ACTIONS);
      const acceptableFinish = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, acceptableState);
      const acceptableScore = scoreAuthoredAttempt(
        HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
        extractFinishScoringInputs(hotShardReplicaLagFailoverRiskSimulation, acceptableFinish),
      );

      const alternateActions: TimedAction[] = [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: HOT_TENANT_THROTTLE_KEY, value: "moderate" },
        { atMs: REPLICA_LAG_ONSET_MS + 2_000, controlKey: WRITE_THROTTLE_SHARD2_KEY, value: "on" },
        { atMs: REPLICA_LAG_ONSET_MS + 3_000, controlKey: REPLICA_CATCHUP_PRIORITY_KEY, value: "prioritized" },
      ];
      const alternateState = runScenario(LAG_DRAIN_WINDOW_ELAPSED_MS + 35_000, alternateActions);
      const alternateFinish = evaluateCandidateDeclaredFinish(hotShardReplicaLagFailoverRiskSimulation, alternateState);
      const alternateScore = scoreAuthoredAttempt(
        HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
        extractFinishScoringInputs(hotShardReplicaLagFailoverRiskSimulation, alternateFinish),
      );

      // Baseline never Finishes -- scored via the unresolved terminal
      // override, no synthetic resolvedAtMs.
      const baselineState = runScenario(REPLICA_LAG_ONSET_MS + 20_000);
      const baselineScore = scoreAuthoredAttempt(
        HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
        extractScoringInputs(hotShardReplicaLagFailoverRiskSimulation, baselineState),
      );

      // Harmful: scale API concurrency broadly, never reaching Finish
      // eligibility.
      const harmfulState = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: API_CONCURRENCY_KEY, value: "high" },
      ]);
      const harmfulScore = scoreAuthoredAttempt(
        HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
        extractScoringInputs(hotShardReplicaLagFailoverRiskSimulation, harmfulState),
      );

      // Unsafe failover path: availability-looking-fine but a real,
      // counted correctness violation.
      const unsafeFailoverState = runScenario(REPLICA_LAG_ONSET_MS + 20_000, [
        { atMs: REPLICA_LAG_ONSET_MS + 1_000, controlKey: FAILOVER_SHARD2_KEY, value: true },
      ]);
      const unsafeFailoverScore = scoreAuthoredAttempt(
        HOT_SHARD_REPLICA_LAG_FAILOVER_RISK_SCORING,
        extractScoringInputs(hotShardReplicaLagFailoverRiskSimulation, unsafeFailoverState),
      );

      // Executed totals, read from an actual run (never assumed).
      expect(optimalScore.total).toBe(980);
      expect(acceptableScore.total).toBe(980);
      expect(alternateScore.total).toBe(940);
      expect(baselineScore.total).toBe(550);
      expect(harmfulScore.total).toBe(420);
      expect(unsafeFailoverScore.total).toBe(365);

      // ── Suspicious-score sanity checks (phase6d.2.md section 12) ──

      // (1) Harmful path does not score too high: strictly below both
      // acceptable and optimal.
      expect(harmfulScore.total).toBeLessThan(acceptableScore.total);
      expect(harmfulScore.total).toBeLessThan(optimalScore.total);

      // (2) No-action baseline does not score too high either.
      expect(baselineScore.total).toBeLessThan(acceptableScore.total);

      // (3) An availability-good/correctness-bad path (unsafe
      // failover) never scores anywhere near optimal, despite
      // immediate write/read success looking fine.
      expect(unsafeFailoverScore.total).toBeLessThan(optimalScore.total / 2);
      expect(unsafeFailoverScore.breakdown.dataIntegrity).toBeLessThanOrEqual(30);

      // (4) Acceptable is never greater than optimal.
      expect(acceptableScore.total).toBeLessThanOrEqual(optimalScore.total);

      // Both genuinely safe paths score full dataIntegrity marks; the
      // correctness-violating path never does, regardless of how the
      // rest of the system reads.
      expect(optimalScore.breakdown.dataIntegrity).toBe(200);
      expect(acceptableScore.breakdown.dataIntegrity).toBe(200);
      expect(unsafeFailoverScore.breakdown.dataIntegrity).toBe(30);
      // The pure-capacity harmful path never touched write authority,
      // so it keeps full dataIntegrity marks -- this is a reliability/
      // recovery failure, not a correctness one, and the score
      // reflects that distinction rather than conflating the two.
      expect(harmfulScore.breakdown.dataIntegrity).toBe(200);
    });
  });
});
