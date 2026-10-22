import { createInitialState, simulate } from "@incidentrank/simulator";
import type { CandidateAction, ControlValue } from "@incidentrank/simulator";
import { paymentRetryStormSimulation } from "./definition";

export interface TimedAction {
  atMs: number;
  controlKey: string;
  value: ControlValue;
  label: string;
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Development-only helper: prints a human-readable timeline of a Payment
 * Retry Storm run. Not used by the candidate UI or by tests' assertions.
 */
export function printScenarioTimeline(
  label: string,
  untilMs: number,
  actions: TimedAction[] = [],
): void {
  let state = createInitialState(paymentRetryStormSimulation);
  let actionIndex = 0;
  let actionCounter = 0;
  let lastPrintedSuccessRate: number | null = null;

  console.log(`\n=== ${label} ===`);
  console.log(`00:00 healthy — checkout success ${state.values.checkoutSuccessRate}%`);

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
      console.log(`${formatMs(timeMs)} action: ${pending.label}`);
      actionIndex += 1;
    }

    const result = simulate(
      paymentRetryStormSimulation,
      state,
      action,
      paymentRetryStormSimulation.tickMs,
    );
    state = result.state;

    for (const event of result.events) {
      if (event.type === "CONFIG_CHANGED" || event.type === "CONFIG_CHANGE_REJECTED") {
        continue;
      }
      console.log(`${formatMs(event.timestampMs)} ${event.type}: ${event.message}`);
    }

    const checkoutSuccessRate = state.values.checkoutSuccessRate as number;
    if (
      lastPrintedSuccessRate === null ||
      Math.abs(checkoutSuccessRate - lastPrintedSuccessRate) >= 1
    ) {
      console.log(
        `${formatMs(state.simulationTimeMs)} checkout success ${checkoutSuccessRate}% | ` +
          `P99 ${state.values.checkoutP99LatencyMs}ms | provider latency ${state.values.paymentProviderLatencyMs}ms | ` +
          `status ${state.status}`,
      );
      lastPrintedSuccessRate = checkoutSuccessRate;
    }
  }

  console.log(
    `--- final: status=${state.status} resolvedAtMs=${state.resolvedAtMs} failedAtMs=${state.failedAtMs} ` +
      `revenueLoss=$${Math.round(state.customerImpact.revenueLossUsd).toLocaleString()} ` +
      `cost=$${state.cost.currentMonthlyCostUsd.toLocaleString()} ` +
      `peakKafkaLag=${state.peaks.peakValues.kafkaLagMessages ?? 0} ` +
      `changes=${state.numberOfConfigurationChanges} ---`,
  );
}
