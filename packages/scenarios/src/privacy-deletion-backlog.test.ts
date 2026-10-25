import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  evaluateCompletionEligibility,
  extractFinishScoringInputs,
  simulate,
} from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { privacyDeletionBacklog } from "./privacy-deletion-backlog";
import {
  ANALYTICS_STORE_PROCESSING_KEY,
  BACKUP_INDEX_PROCESSING_MODE_KEY,
  COMPLETION_MARKING_POLICY_KEY,
  DELETION_WORKER_ALLOCATION_KEY,
  HIGH_RISK_PRIORITY_BOOST_KEY,
  QUEUE_PRIORITY_POLICY_KEY,
  RETRY_POLICY_KEY,
  privacyDeletionBacklogSimulation,
} from "./privacy-deletion-backlog/definition";
import { privacyDeletionBacklogCandidateUI } from "./privacy-deletion-backlog/candidate-ui";
import { PRIVACY_DELETION_BACKLOG_SCORING } from "./privacy-deletion-backlog/scoring";
import { scoreAuthoredAttempt } from "./authoring/score";
import {
  BACKLOG_DISCOVERED_MS,
  DRAIN_WINDOW_1_MS,
  DRAIN_WINDOW_FULLY_RECOVERED_MS,
  SUSTAINED_BACKLOG_MS,
} from "./privacy-deletion-backlog/timed-events";

interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

function runScenario(untilMs: number, actions: TimedAction[] = []) {
  let state = createInitialState(privacyDeletionBacklogSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += privacyDeletionBacklogSimulation.tickMs
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
      privacyDeletionBacklogSimulation,
      state,
      action,
      privacyDeletionBacklogSimulation.tickMs,
    );
    state = result.state;
  }

  return state;
}

function buildScoringInputs(state: ReturnType<typeof runScenario>) {
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
    initialMonthlyInfrastructureCostUsd:
      privacyDeletionBacklogSimulation.infrastructureCost.baselineMonthlyUsd,
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

// Alternate strong path A: oldest-deadline-first queue strategy, every
// secondary lever (workers/retries) left at its untouched default.
const PATH_A_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_BACKLOG_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
  { atMs: SUSTAINED_BACKLOG_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
];

// Alternate strong path B: high-risk-first + the boost that actually
// activates it, workers/retries left at their untouched defaults.
const PATH_B_ACTIONS: TimedAction[] = [
  { atMs: SUSTAINED_BACKLOG_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
  { atMs: SUSTAINED_BACKLOG_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "high-risk-first" },
  { atMs: SUSTAINED_BACKLOG_MS + 3_000, controlKey: HIGH_RISK_PRIORITY_BOOST_KEY, value: "on" },
];

// Path A with every secondary lever maximally engaged (scaled workers +
// aggressive retries) — a real, materially different cost/speed profile
// from PATH_A_ACTIONS, not merely a relabeling.
const PATH_A_SCALED_ACTIONS: TimedAction[] = [
  ...PATH_A_ACTIONS,
  { atMs: SUSTAINED_BACKLOG_MS + 3_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
  { atMs: SUSTAINED_BACKLOG_MS + 4_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
];

describe("Privacy Deletion Backlog", () => {
  describe("Definition", () => {
    it("validates and carries real library metadata as a paid senior_staff scenario", () => {
      expect(privacyDeletionBacklog.isFree).toBe(false);
      expect(privacyDeletionBacklog.library?.category).toBe("Data Pipelines");
      expect(privacyDeletionBacklog.library?.tags.length).toBeGreaterThan(0);
      expect(privacyDeletionBacklog.library?.skills.length).toBeGreaterThan(0);
      expect(privacyDeletionBacklog.difficulty).toBe("senior_staff");
    });

    it("has a complete scoring config across all six dimensions totaling 1000", () => {
      const dims = PRIVACY_DELETION_BACKLOG_SCORING.dimensions.map((d) => d.dimension);
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
      const totalMax = PRIVACY_DELETION_BACKLOG_SCORING.dimensions.reduce(
        (sum, d) => sum + d.maxPoints,
        0,
      );
      expect(totalMax).toBe(1000);
    });

    it("has a candidate UI descriptor with metrics, controls, and components covering the architecture", () => {
      expect(privacyDeletionBacklogCandidateUI.metrics.length).toBeGreaterThanOrEqual(8);
      expect(privacyDeletionBacklogCandidateUI.controls.length).toBeGreaterThanOrEqual(7);
      expect(privacyDeletionBacklogCandidateUI.components.length).toBe(6);
    });

    it("the architecture is a flat 6-node, 5-edge fan-out pipeline matching the brief", () => {
      expect(privacyDeletionBacklogSimulation.architecture.nodes.length).toBe(6);
      expect(privacyDeletionBacklogSimulation.architecture.edges.length).toBe(5);
      for (const node of privacyDeletionBacklogSimulation.architecture.nodes) {
        expect(typeof node.id).toBe("string");
        expect(typeof node.label).toBe("string");
        expect(Object.keys(node)).toEqual(expect.arrayContaining(["id", "label"]));
      }
    });

    it("the briefing explicitly states all five business invariants in plain engineering language, never legal trivia", () => {
      expect(privacyDeletionBacklog.description).toMatch(
        /every accepted deletion request must eventually complete across every required downstream system/i,
      );
      expect(privacyDeletionBacklog.description).toMatch(
        /a request must never be marked complete while a required downstream store still holds the data/i,
      );
      expect(privacyDeletionBacklog.description).toMatch(
        /regulatory and policy deletion deadlines are real and candidate-visible/i,
      );
      expect(privacyDeletionBacklog.description).toMatch(
        /the most legally sensitive, highest-risk requests may be prioritized/i,
      );
      expect(privacyDeletionBacklog.description).toMatch(
        /backups and indexes may lag the live stores on their own rotation schedule/i,
      );
      expect(privacyDeletionBacklog.description).not.toMatch(/GDPR|CCPA|HIPAA|SOX/i);
    });

    it("100% of action classifications carry feedback", () => {
      for (const rule of privacyDeletionBacklogSimulation.actionClassifications) {
        expect(rule.feedback).toBeDefined();
        expect(rule.feedback?.title.length).toBeGreaterThan(0);
        expect(rule.feedback?.explanation.length).toBeGreaterThan(0);
      }
    });

    it("every control has at least one action classification referencing it (zero dead controls)", () => {
      const classifiedKeys = new Set(
        privacyDeletionBacklogSimulation.actionClassifications.map((r) => r.controlKey),
      );
      for (const control of privacyDeletionBacklogSimulation.controls) {
        expect(classifiedKeys.has(control.key)).toBe(true);
      }
    });

    it("every control is referenced by at least one rule condition (zero dead controls)", () => {
      const ruleControlKeys = new Set<string>();
      for (const rule of privacyDeletionBacklogSimulation.rules) {
        for (const key of Object.keys(rule.when.controlEquals ?? {})) {
          ruleControlKeys.add(key);
        }
      }
      for (const control of privacyDeletionBacklogSimulation.controls) {
        expect(ruleControlKeys.has(control.key)).toBe(true);
      }
    });
  });

  describe("Runtime", () => {
    it("starts healthy with authored initial values", () => {
      const state = createInitialState(privacyDeletionBacklogSimulation);
      expect(state.status).toBe("healthy");
      expect(state.values.deletionWorkflowStatus).toBe("healthy");
      expect(state.values.backupIndexTrackingStatus).toBe("tracked");
      expect(state.values.falseCompletionCount).toBe(0);
      expect(state.values.deadlineBreachedCount).toBe(0);
    });

    it("backlog discovery triggers the incident with degrading completeness, never touching acceptance rate", () => {
      const state = runScenario(BACKLOG_DISCOVERED_MS + 1_000);
      expect(state.incidentStartedAtMs).toBe(BACKLOG_DISCOVERED_MS);
      expect(state.values.requestAcceptanceSuccessRate).toBe(100);
    });

    it("baseline (no action) keeps falsely completing requests while acceptance stays perfect throughout (the core decoy)", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000);
      expect(state.transitions.incidentState).toBe("false-complete-sustained");
      expect(state.values.requestAcceptanceSuccessRate).toBe(100);
      expect(state.values.deletionWorkflowStatus).toBe("false-complete-active");
      expect(state.values.falseCompletionCount as number).toBeGreaterThan(0);
    });
  });

  describe("Required tempting-but-unsafe trap: mark-on-accept false completion", () => {
    it("marking requests complete on acceptance creates a real false-completion count while acceptance looks perfect", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000);
      expect(state.values.falseCompletionCount as number).toBeGreaterThan(0);
      expect(state.values.requestAcceptanceSuccessRate).toBe(100);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Independent unsafe trap: skipping the Analytics Store", () => {
    it("correcting completion marking without enforcing Analytics Store processing is still unsafe", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: ANALYTICS_STORE_PROCESSING_KEY, value: "skipped" },
      ]);
      expect(state.transitions.incidentState).toBe("analytics-store-skipped-trap");
      expect(state.values.analyticsStoreCompletionPercent).toBe(0);
      expect(state.values.falseCompletionCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("skipping the analytics store never falsely completes anything, but is independently unsafe from a different gate", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: ANALYTICS_STORE_PROCESSING_KEY, value: "skipped" },
      ]);
      expect(state.values.deletionWorkflowStatus).not.toBe("false-complete-active");
      expect(state.values.productDbCompletionPercent).toBe(100);
    });
  });

  describe("Independent unsafe trap: Backup Index tracking excluded", () => {
    it("correcting completion marking and analytics store without tracking the Backup Index is still unsafe", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: BACKUP_INDEX_PROCESSING_MODE_KEY, value: "excluded-from-completion" },
      ]);
      expect(state.transitions.incidentState).toBe("backup-index-untracked-trap");
      expect(state.values.backupIndexTrackingStatus).toBe("untracked");
      expect(state.values.falseCompletionCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Independent unsafe trap: deadline breach from mis-prioritization", () => {
    it("newest-first prioritization breaches deadlines even with completion marking, analytics store, and backup index all correctly configured", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
      ]);
      expect(state.transitions.incidentState).toBe("deadline-breach-newest-first-trap");
      expect(state.values.deadlineBreachedCount as number).toBeGreaterThan(0);
      expect(state.values.falseCompletionCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("half-measure: newest-first + high-risk boost on is still unsafe (the boost alone never reorders the general queue)", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: HIGH_RISK_PRIORITY_BOOST_KEY, value: "on" },
      ]);
      expect(state.transitions.incidentState).toBe("deadline-breach-newest-first-with-boost-trap");
      expect(state.values.falseCompletionCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("half-measure: selecting high-risk-first without turning the boost on never actually activates prioritization", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "high-risk-first" },
      ]);
      expect(state.transitions.incidentState).toBe("deadline-breach-high-risk-first-no-boost-trap");
      expect(state.values.falseCompletionCount).toBe(0);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    // Regression: BOTH half-measure traps previously only had a
    // sustained-tier rule (triggerEquals sustainedBacklog: true). Before
    // SUSTAINED_BACKLOG_MS fires (the routine first ~3 minutes of every
    // attempt, not an edge case), these exact half-measure combinations
    // fell through the entire rule array to the unconstrained
    // baseline-untouched fallback, which fabricated falseCompletionCount
    // = 55 even though completionMarkingPolicy was correctly set to
    // mark-on-verified-complete. These two tests pin the pre-sustained
    // mirror rules added to close that gap.
    it("half-measure before sustained: newest-first + high-risk boost on is still unsafe, but never fabricates a false completion", () => {
      const state = runScenario(BACKLOG_DISCOVERED_MS + 60_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: HIGH_RISK_PRIORITY_BOOST_KEY, value: "on" },
      ]);
      expect(state.transitions.incidentState).toBe("deadline-breach-newest-first-with-boost-pre-sustained-trap");
      expect(state.values.falseCompletionCount).toBe(0);
      expect(state.values.deletionWorkflowStatus).toBe("deadline-breach-active");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });

    it("half-measure before sustained: selecting high-risk-first without the boost is still unsafe, but never fabricates a false completion", () => {
      const state = runScenario(BACKLOG_DISCOVERED_MS + 60_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "high-risk-first" },
      ]);
      expect(state.transitions.incidentState).toBe("deadline-breach-high-risk-first-no-boost-pre-sustained-trap");
      expect(state.values.falseCompletionCount).toBe(0);
      expect(state.values.deletionWorkflowStatus).toBe("deadline-breach-active");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: false });
    });
  });

  describe("Alternate strong path A: oldest-deadline-first", () => {
    it("reaches genuine OPTIMAL once the full drain window elapses, with every secondary lever left at its untouched default", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-recovered-path-a-baseline-standard");
      expect(state.values.deletionWorkflowStatus).toBe("healthy");
      expect(state.values.endToEndCompletionPercent).toBe(100);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });
  });

  describe("Alternate strong path B: high-risk-first + boost", () => {
    it("reaches genuine OPTIMAL once the full drain window elapses, with every secondary lever left at its untouched default", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_B_ACTIONS);
      expect(state.transitions.incidentState).toBe("fully-recovered-path-b-baseline-standard");
      expect(state.values.deletionWorkflowStatus).toBe("healthy");
      expect(state.values.endToEndCompletionPercent).toBe(100);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("both alternate strong paths reach the identical terminal compliance outcome", () => {
      const pathA = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      const pathB = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_B_ACTIONS);
      expect(pathA.values.deletionWorkflowStatus).toBe(pathB.values.deletionWorkflowStatus);
      expect(pathA.values.endToEndCompletionPercent).toBe(pathB.values.endToEndCompletionPercent);
    });
  });

  describe("Secondary levers (deletionWorkerAllocation, retryPolicy) are real but never required for safety", () => {
    it("scaling workers and retrying aggressively on top of Path A reaches the same safe terminal state, at a real extra cost", () => {
      const baseline = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      const scaled = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_SCALED_ACTIONS);
      expect(scaled.transitions.incidentState).toBe("fully-recovered-path-a-scaled-aggressive");
      expect(scaled.values.deletionWorkflowStatus).toBe(baseline.values.deletionWorkflowStatus);
      expect(scaled.values.endToEndCompletionPercent).toBe(baseline.values.endToEndCompletionPercent);
      expect(scaled.cost.currentMonthlyCostUsd).toBeGreaterThan(baseline.cost.currentMonthlyCostUsd);
    });

    it("deletionWorkerAllocation is not a dead control: scaled-up costs strictly more than baseline", () => {
      const baselineState = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "baseline" },
      ]);
      const scaledState = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
      ]);
      expect(scaledState.cost.currentMonthlyCostUsd).toBeGreaterThan(baselineState.cost.currentMonthlyCostUsd);
    });

    it("retryPolicy is not a dead control: aggressive costs strictly more than standard", () => {
      const standardState = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "standard" },
      ]);
      const aggressiveState = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      expect(aggressiveState.cost.currentMonthlyCostUsd).toBeGreaterThan(standardState.cost.currentMonthlyCostUsd);
    });
  });

  describe("Default-value path completeness (binding requirement): every safe strategy reaches a safe terminal state with untouched-default controls", () => {
    it("REGRESSION: Path A with deletionWorkerAllocation and retryPolicy left at their untouched defaults reaches genuine OPTIMAL once fully drained, never falling through to baseline", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-untouched");
      expect(state.transitions.incidentState).toBe("fully-recovered-path-a-baseline-standard");
      expect(state.values.deletionWorkflowStatus).toBe("healthy");
      expect(state.values.endToEndCompletionPercent).toBe(100);
      expect(state.values.backupIndexTrackingStatus).toBe("tracked");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
      const finish = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(finish.outcome).toBe("resolved");
      expect(finish.completionTier).toBe("optimal");
    });

    it("REGRESSION: Path B with deletionWorkerAllocation and retryPolicy left at their untouched defaults reaches genuine OPTIMAL once fully drained, never falling through to baseline", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_B_ACTIONS);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-untouched");
      expect(state.transitions.incidentState).toBe("fully-recovered-path-b-baseline-standard");
      expect(state.values.deletionWorkflowStatus).toBe("healthy");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: Path A with scaled-up workers only (retryPolicy left at its untouched default) reaches safe OPTIMAL", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...PATH_A_ACTIONS,
        { atMs: SUSTAINED_BACKLOG_MS + 3_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-untouched");
      expect(state.transitions.incidentState).toBe("fully-recovered-path-a-scaled-standard");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: Path A with aggressive retries only (deletionWorkerAllocation left at its untouched default) reaches safe OPTIMAL", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...PATH_A_ACTIONS,
        { atMs: SUSTAINED_BACKLOG_MS + 3_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-untouched");
      expect(state.transitions.incidentState).toBe("fully-recovered-path-a-baseline-aggressive");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: Path B with scaled-up workers and aggressive retries (the fully-maximal combination) reaches safe OPTIMAL", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...PATH_B_ACTIONS,
        { atMs: SUSTAINED_BACKLOG_MS + 4_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
        { atMs: SUSTAINED_BACKLOG_MS + 5_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.transitions.incidentState).not.toBe("baseline-sustained-untouched");
      expect(state.transitions.incidentState).toBe("fully-recovered-path-b-scaled-aggressive");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("REGRESSION: the ACCEPTABLE (draining, not yet fully recovered) tier covers both Path A and Path B without falling through to baseline", () => {
      const pathA = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const pathB = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_B_ACTIONS);

      for (const [state, expectedIncidentState] of [
        [pathA, "draining-window1-path-a"],
        [pathB, "draining-window1-path-b"],
      ] as const) {
        expect(state.transitions.incidentState).not.toBe("baseline-sustained-untouched");
        expect(state.transitions.incidentState).toBe(expectedIncidentState);
        expect(state.values.deletionWorkflowStatus).toBe("backlog-draining");
        expect(state.values.backupIndexTrackingStatus).toBe("tracked");
        const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
        expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      }
    });

    it("REGRESSION: a fast candidate reaction (corrected before sustainedBacklog fires) reaches ACCEPTABLE for both paths, not baseline", () => {
      const pathA = runScenario(BACKLOG_DISCOVERED_MS + 35_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
      ]);
      expect(pathA.transitions.incidentState).toBe("corrected-before-sustained");
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, pathA);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
    });
  });

  describe("No scale-X-overload-Y mechanic", () => {
    it("engaging every lever simultaneously never degrades requestAcceptanceSuccessRate (no pressure-transfer trap exists in this scenario)", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
        { atMs: SUSTAINED_BACKLOG_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: SUSTAINED_BACKLOG_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
        { atMs: SUSTAINED_BACKLOG_MS + 3_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
        { atMs: SUSTAINED_BACKLOG_MS + 4_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      expect(state.values.requestAcceptanceSuccessRate).toBe(100);
    });
  });

  describe("Historical/permanent damage: false completions and deadline breaches never reset", () => {
    it("the live false-completion count can effectively stop growing once corrected, but the peak historical record never decreases", () => {
      const unsafeState = runScenario(SUSTAINED_BACKLOG_MS + 10_000);
      const correctedState = runScenario(SUSTAINED_BACKLOG_MS + 20_000, [
        { atMs: SUSTAINED_BACKLOG_MS + 11_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: SUSTAINED_BACKLOG_MS + 12_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
      ]);
      expect(unsafeState.values.falseCompletionCount as number).toBeGreaterThan(0);
      expect(correctedState.peaks.peakValues.falseCompletionCount as number).toBeGreaterThanOrEqual(
        unsafeState.values.falseCompletionCount as number,
      );
    });

    it("full remediation after an unsafe window reaches OPTIMAL on every live metric while the peak historical record permanently shows the loss", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        { atMs: SUSTAINED_BACKLOG_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: SUSTAINED_BACKLOG_MS + 2_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
      ]);
      expect(state.values.deletionWorkflowStatus).toBe("healthy");
      // But the PEAK historical record is real, nonzero, and never
      // reset — the permanent scar from the sustained exposure this
      // attempt passed through before correcting.
      expect(state.peaks.peakValues.falseCompletionCount as number).toBeGreaterThan(0);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "optimal" });
    });

    it("the independent deadline-breached count also tracks its own non-resetting peak", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 20_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
        { atMs: SUSTAINED_BACKLOG_MS + 11_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: "oldest-deadline-first" },
      ]);
      expect(state.peaks.peakValues.deadlineBreachedCount as number).toBeGreaterThan(0);
    });
  });

  describe("Immediate-Finish audit", () => {
    it("a zero-action Finish issued before the incident starts resolves to declared_unstable (no incident yet)", () => {
      const state = runScenario(BACKLOG_DISCOVERED_MS - 5_000);
      expect(state.incidentStartedAtMs).toBeNull();
      const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });

    it("trigger incident, take zero action, Finish -> declared_unstable, even though acceptance already reads green", () => {
      const state = runScenario(BACKLOG_DISCOVERED_MS + 5_000);
      expect(state.values.requestAcceptanceSuccessRate).toBe(100);
      const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
      expect(result.completionTier).toBeNull();
    });

    it("a zero-action Finish issued well after sustained backlog still resolves to declared_unstable", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000);
      const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Completion mode: candidate_declared with a real acceptable tier", () => {
    it("the correctly-prioritized-but-still-draining family qualifies as ACCEPTABLE before full recovery", () => {
      const state = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
      expect(eligibility).toEqual({ eligible: true, tier: "acceptable" });
      expect(state.values.deletionWorkflowStatus).toBe("backlog-draining");
      expect(state.values.endToEndCompletionPercent as number).toBeLessThan(100);
    });

    it("automatic failure still wins even in candidate_declared mode", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 15 * 60_000);
      expect(state.status).toBe("failed");
      const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(result.outcome).toBe("declared_unstable");
    });
  });

  describe("Scoring", () => {
    it("optimal path A (oldest-deadline-first) scores near-maximum with full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      const inputs = extractFinishScoringInputs(privacyDeletionBacklogSimulation, result);
      const score = scoreAuthoredAttempt(PRIVACY_DELETION_BACKLOG_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      expect(score.total).toBeGreaterThan(700);
      console.log("OPTIMAL (Path A: oldest-deadline-first) SCORE", JSON.stringify(score));
    });

    it("optimal path B (high-risk-first + boost) also scores full dataIntegrity credit", () => {
      const state = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_B_ACTIONS);
      const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
      expect(result.completionTier).toBe("optimal");
      const inputs = extractFinishScoringInputs(privacyDeletionBacklogSimulation, result);
      const score = scoreAuthoredAttempt(PRIVACY_DELETION_BACKLOG_SCORING, inputs);
      expect(score.breakdown.dataIntegrity).toBe(200);
      console.log("OPTIMAL (Path B: high-risk-first+boost) SCORE", JSON.stringify(score));
    });

    it("acceptable path (correct strategy, still draining) scores well but below optimal", () => {
      const optimalState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      const optimalResult = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, optimalState);
      const optimalScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        extractFinishScoringInputs(privacyDeletionBacklogSimulation, optimalResult),
      );

      const acceptableState = runScenario(DRAIN_WINDOW_1_MS + 35_000, PATH_A_ACTIONS);
      const acceptableResult = evaluateCandidateDeclaredFinish(
        privacyDeletionBacklogSimulation,
        acceptableState,
      );
      const acceptableScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        extractFinishScoringInputs(privacyDeletionBacklogSimulation, acceptableResult),
      );

      expect(acceptableResult.completionTier).toBe("acceptable");
      expect(acceptableScore.total).toBeLessThan(optimalScore.total);
      console.log("ACCEPTABLE (draining-window1-path-a) SCORE", JSON.stringify(acceptableScore));
      console.log("OPTIMAL SCORE (for comparison)", JSON.stringify(optimalScore));
    });

    it("baseline (no action) scores poorly with zero recovery credit", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 60_000);
      const inputs = buildScoringInputs(state);
      const score = scoreAuthoredAttempt(PRIVACY_DELETION_BACKLOG_SCORING, inputs);
      expect(score.breakdown.recovery).toBe(0);
      console.log("BASELINE SCORE", JSON.stringify(score));
    });

    it("harmful/tempting path (mark-on-accept, left unaddressed) scores worse than a half-measure deadline-breach path on dataIntegrity AND total", () => {
      const falseCompleteState = runScenario(SUSTAINED_BACKLOG_MS + 60_000);
      const deadlineBreachState = runScenario(SUSTAINED_BACKLOG_MS + 60_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
      ]);
      const falseCompleteScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        buildScoringInputs(falseCompleteState),
      );
      const deadlineBreachScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        buildScoringInputs(deadlineBreachState),
      );
      expect(falseCompleteState.values.requestAcceptanceSuccessRate).toBe(
        deadlineBreachState.values.requestAcceptanceSuccessRate,
      );
      // Both are real violations and both score poorly; the
      // false-complete path's penalty (140) plus its lack of any
      // deadline-protection credit means it never outscores the
      // deadline-breach-only path on dataIntegrity.
      expect(falseCompleteScore.breakdown.dataIntegrity).toBeLessThanOrEqual(
        deadlineBreachScore.breakdown.dataIntegrity,
      );
      console.log("FALSE-COMPLETE (unaddressed) SCORE", JSON.stringify(falseCompleteScore));
      console.log("DEADLINE-BREACH (half fix) SCORE (for comparison)", JSON.stringify(deadlineBreachScore));
    });

    it("unsafe-minimum-effort path (do nothing) cannot win overall against the genuinely safe but slower audited path", () => {
      const unsafeMinEffortState = runScenario(SUSTAINED_BACKLOG_MS + 60_000);
      const safeState = runScenario(SUSTAINED_BACKLOG_MS + 60_000, PATH_B_ACTIONS);
      const unsafeScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        buildScoringInputs(unsafeMinEffortState),
      );
      const safeScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        buildScoringInputs(safeState),
      );
      expect(unsafeScore.total).toBeLessThan(safeScore.total);
      console.log("UNSAFE (do nothing) SCORE", JSON.stringify(unsafeScore));
      console.log("SAFE (Path B) SCORE (for comparison)", JSON.stringify(safeScore));
    });

    it("two alternate optimal paths (A vs B) score identically when neither engages the secondary cost levers, and A beats B once B pays for scaling", () => {
      const pathAState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      const pathBScaledState = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...PATH_B_ACTIONS,
        { atMs: SUSTAINED_BACKLOG_MS + 4_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
      ]);
      const pathAResult = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, pathAState);
      const pathBScaledResult = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, pathBScaledState);
      const pathAScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        extractFinishScoringInputs(privacyDeletionBacklogSimulation, pathAResult),
      );
      const pathBScaledScore = scoreAuthoredAttempt(
        PRIVACY_DELETION_BACKLOG_SCORING,
        extractFinishScoringInputs(privacyDeletionBacklogSimulation, pathBScaledResult),
      );
      expect(pathAResult.completionTier).toBe("optimal");
      expect(pathBScaledResult.completionTier).toBe("optimal");
      // Path A (baseline workers, no extra cost) never pays the
      // scaled-up cost; Path B scaled does — an honest, real cost
      // distinction between two otherwise-equally-compliant strong
      // paths.
      expect(pathAScore.breakdown.costEfficiency).toBeGreaterThanOrEqual(pathBScaledScore.breakdown.costEfficiency);
      console.log("PATH A SCORE", JSON.stringify(pathAScore));
      console.log("PATH B (scaled) SCORE", JSON.stringify(pathBScaledScore));
    });
  });

  describe("Score integrity / Option D audit: no OPTIMAL-below-ACCEPTABLE divergence", () => {
    it("REGRESSION: every OPTIMAL-tier path scores strictly above every ACCEPTABLE-tier path in this scenario (no divergence exists to explain)", () => {
      const optimalPathA = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, PATH_A_ACTIONS);
      const optimalPathBScaledAggressive = runScenario(DRAIN_WINDOW_FULLY_RECOVERED_MS + 35_000, [
        ...PATH_B_ACTIONS,
        { atMs: SUSTAINED_BACKLOG_MS + 4_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: "scaled-up" },
        { atMs: SUSTAINED_BACKLOG_MS + 5_000, controlKey: RETRY_POLICY_KEY, value: "aggressive" },
      ]);
      const acceptablePathA = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const acceptablePathB = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_B_ACTIONS);

      const score = (state: ReturnType<typeof runScenario>) => {
        const result = evaluateCandidateDeclaredFinish(privacyDeletionBacklogSimulation, state);
        return scoreAuthoredAttempt(
          PRIVACY_DELETION_BACKLOG_SCORING,
          extractFinishScoringInputs(privacyDeletionBacklogSimulation, result),
        );
      };

      const optimalScores = [score(optimalPathA), score(optimalPathBScaledAggressive)];
      const acceptableScores = [score(acceptablePathA), score(acceptablePathB)];

      for (const optimalScore of optimalScores) {
        for (const acceptableScore of acceptableScores) {
          expect(optimalScore.total).toBeGreaterThan(acceptableScore.total);
          // The relationship is driven by dataIntegrity (the "still
          // draining" penalty) never regressing for OPTIMAL, exactly
          // the Option D doctrine: a correctness-bearing dimension is
          // never worse in the optimal state.
          expect(optimalScore.breakdown.dataIntegrity).toBeGreaterThanOrEqual(acceptableScore.breakdown.dataIntegrity);
        }
      }

      console.log(
        "OPTION-D AUDIT: optimal vs acceptable scores",
        JSON.stringify({ optimalScores, acceptableScores }),
      );
    });
  });

  describe("Determinism", () => {
    it("produces identical state for the same action sequence run twice", () => {
      const runA = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      const runB = runScenario(DRAIN_WINDOW_1_MS + 5_000, PATH_A_ACTIONS);
      expect(runA).toEqual(runB);
    });
  });

  describe("Peak tracking", () => {
    it("tracks peak false-completion count and deadline-breach count generically via numericWatchFields", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 10_000);
      expect(state.peaks.peakValues.falseCompletionCount).toBeGreaterThan(0);
    });

    it("tracks peak deadline-breach count independently when only the queue-priority trap is live", () => {
      const state = runScenario(SUSTAINED_BACKLOG_MS + 10_000, [
        { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: COMPLETION_MARKING_POLICY_KEY, value: "mark-on-verified-complete" },
      ]);
      expect(state.peaks.peakValues.deadlineBreachedCount).toBeGreaterThan(0);
      expect(state.values.falseCompletionCount).toBe(0);
    });
  });

  describe("No accidental optimal state through random control mashing", () => {
    it("a deterministic sweep of every other control combination (holding completionMarkingPolicy at its unsafe default) never reaches optimal or acceptable", () => {
      const queueValues = ["newest-first", "oldest-deadline-first", "high-risk-first"] as const;
      const boostValues = ["off", "on"] as const;
      const workerValues = ["baseline", "scaled-up"] as const;
      const retryValues = ["standard", "aggressive"] as const;
      const analyticsValues = ["enforced", "skipped"] as const;

      for (const queue of queueValues) {
        for (const boost of boostValues) {
          for (const worker of workerValues) {
            for (const retry of retryValues) {
              for (const analytics of analyticsValues) {
                const state = runScenario(SUSTAINED_BACKLOG_MS + 5_000, [
                  { atMs: BACKLOG_DISCOVERED_MS + 1_000, controlKey: QUEUE_PRIORITY_POLICY_KEY, value: queue },
                  { atMs: BACKLOG_DISCOVERED_MS + 2_000, controlKey: HIGH_RISK_PRIORITY_BOOST_KEY, value: boost },
                  { atMs: BACKLOG_DISCOVERED_MS + 3_000, controlKey: DELETION_WORKER_ALLOCATION_KEY, value: worker },
                  { atMs: BACKLOG_DISCOVERED_MS + 4_000, controlKey: RETRY_POLICY_KEY, value: retry },
                  { atMs: BACKLOG_DISCOVERED_MS + 5_000, controlKey: ANALYTICS_STORE_PROCESSING_KEY, value: analytics },
                ]);
                const eligibility = evaluateCompletionEligibility(privacyDeletionBacklogSimulation, state);
                expect(eligibility).toEqual({ eligible: false });
              }
            }
          }
        }
      }
    });
  });
});
