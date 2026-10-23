import {
  createInitialState,
  evaluateCandidateDeclaredFinish,
  extractFinishScoringInputs,
  simulate,
  type CandidateAction,
  type ControlValue,
  type ScoringInputs,
} from "@incidentrank/simulator";
import { paymentRetryStormSimulation } from "@incidentrank/scenarios";

export interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

/**
 * Runs the real Payment Retry Storm scenario from T=0 to `untilMs`,
 * applying each authored action at its scheduled time, and returns the raw
 * scoring inputs the engine exposes at the end of the run.
 */
export function runScenarioForScoring(
  untilMs: number,
  actions: TimedAction[] = [],
): ScoringInputs {
  let state = createInitialState(paymentRetryStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;

  for (
    let timeMs = 0;
    timeMs < untilMs;
    timeMs += paymentRetryStormSimulation.tickMs
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
      paymentRetryStormSimulation,
      state,
      action,
      paymentRetryStormSimulation.tickMs,
    );
    state = result.state;
  }

  // Payment Retry Storm is candidate_declared (Phase 6.1), so the engine
  // itself never writes state.resolvedAtMs even when the success/
  // acceptable condition is genuinely, sustainedly satisfied — only a
  // real Finish declaration decides that. Use the same shared
  // evaluateCandidateDeclaredFinish core practice/assessment Finish call,
  // so this scoring harness reflects what a candidate who actually
  // declared Finish at this moment would be scored on, not an engine
  // field that structurally can never be set for this scenario.
  const finishResult = evaluateCandidateDeclaredFinish(paymentRetryStormSimulation, state);
  return extractFinishScoringInputs(paymentRetryStormSimulation, finishResult);
}
