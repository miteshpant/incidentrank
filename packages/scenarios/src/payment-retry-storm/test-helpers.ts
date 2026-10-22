import {
  createInitialState,
  simulate,
  type CandidateAction,
  type ControlValue,
  type SimulationEvent,
  type SimulationState,
} from "@incidentrank/simulator";
import { paymentRetryStormSimulation } from "./definition";

export interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
}

export interface RunResult {
  finalState: SimulationState;
  allEvents: SimulationEvent[];
}

/**
 * Runs the Payment Retry Storm scenario from T=0 to `untilMs`, applying
 * each authored action at its scheduled time. One call per simulated
 * second, matching how the engine advances tick-by-tick.
 */
export function runScenario(untilMs: number, actions: TimedAction[] = []): RunResult {
  let state = createInitialState(paymentRetryStormSimulation);
  const allEvents: SimulationEvent[] = [];
  let actionIndex = 0;
  let actionCounter = 0;

  for (let timeMs = 0; timeMs < untilMs; timeMs += paymentRetryStormSimulation.tickMs) {
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
    allEvents.push(...result.events);
  }

  return { finalState: state, allEvents };
}
