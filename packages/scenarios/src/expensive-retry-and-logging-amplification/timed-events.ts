import type { TimedEvent } from "@incidentrank/simulator";

// Incident start: finance/observability tooling has just flagged that a
// recent deploy raised retry frequency, logging verbosity, telemetry
// duplication, and payload logging size. This is NOT an outage —
// requestSuccessRate and the External Dependency's own health are both
// fine at this exact moment and stay fine through nearly every reachable
// state below. Nothing is "failing"; cost and observability posture are
// the thing to fix.
export const DEPLOY_REGRESSION_DETECTED_MS = 15_000;

// If left unaddressed this long, the cost regression has simply
// persisted at the same (bounded, non-worsening) elevated level — no
// external event makes it worse on its own; it only stays expensive
// because nobody has changed anything.
export const SUSTAINED_UNADDRESSED_MS = DEPLOY_REGRESSION_DETECTED_MS + 4 * 60_000;

// Cost-reduction levers do not take effect instantly on the tick a
// control is flipped — the Logging + Telemetry Pipeline and the
// dependency-cost accounting both settle over a real elapsed window,
// mirroring every other scenario's recovery-lag convention. Anchored
// after SUSTAINED_UNADDRESSED_MS so they are reachable even in the
// worst-case timeline where the candidate let the regression run its
// full course before intervening.
export const COST_SETTLING_WINDOW_1_MS = SUSTAINED_UNADDRESSED_MS + 30_000;
export const COST_SETTLING_FULLY_DONE_MS = SUSTAINED_UNADDRESSED_MS + 90_000;

export const timedEvents: TimedEvent[] = [
  {
    id: "deploy-regression-detected",
    atMs: DEPLOY_REGRESSION_DETECTED_MS,
    type: "TRIGGER_SET",
    message:
      "Finance/observability tooling flagged a cost regression: a recent deploy raised retry frequency, logging verbosity, telemetry duplication, and payload logging size. Request success rate and dependency health are both normal right now — this is a cost and observability-posture problem, not an outage.",
    setTriggers: { deployRegressionDetected: true },
  },
  {
    id: "sustained-unaddressed",
    atMs: SUSTAINED_UNADDRESSED_MS,
    type: "THRESHOLD_CROSSED",
    message:
      "The cost regression has persisted, unaddressed, for several minutes of simulated time — no corrective action has been taken and the elevated spend has not grown further on its own.",
    setTriggers: { deployRegressionDetected: true, sustainedUnaddressed: true },
  },
  {
    id: "cost-settling-window-1-elapsed",
    atMs: COST_SETTLING_WINDOW_1_MS,
    type: "TRIGGER_SET",
    message:
      "A first real elapsed window has passed since any corrective cost/logging change was made — pipeline-side cost accounting is partway through settling to reflect it.",
    setTriggers: { costSettlingWindow1Elapsed: true },
  },
  {
    id: "cost-settling-fully-done",
    atMs: COST_SETTLING_FULLY_DONE_MS,
    type: "TRIGGER_SET",
    message:
      "Enough elapsed time has passed for the Logging + Telemetry Pipeline's cost accounting to fully reflect whatever corrective changes have been made.",
    setTriggers: {
      costSettlingWindow1Elapsed: true,
      costSettlingFullyDone: true,
    },
  },
];
