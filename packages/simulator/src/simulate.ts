import { classifyAction, isValidControlValue } from "./actions";
import { tickOnce } from "./tick";
import type {
  CandidateAction,
  ScenarioSimulationDefinition,
  SimulationEvent,
  SimulationResult,
  SimulationState,
} from "./types";

export function createInitialState(
  scenario: ScenarioSimulationDefinition,
): SimulationState {
  const controlValues: Record<string, SimulationState["controlValues"][string]> = {};
  for (const control of scenario.controls) {
    controlValues[control.key] = control.initialValue;
  }

  const severityAnnounced: Record<string, boolean> = {};
  for (const field of scenario.severityFields) {
    severityAnnounced[field.key] = false;
  }
  const thresholdAnnounced: Record<string, boolean> = {};
  const peakValues: Record<string, number> = {};
  for (const field of scenario.numericWatchFields) {
    thresholdAnnounced[field.key] = false;
    if (field.trackPeak) {
      const initial = scenario.initialValues[field.key];
      peakValues[field.key] = typeof initial === "number" ? initial : 0;
    }
  }

  return {
    simulationTimeMs: 0,
    status: "healthy",
    incidentStartedAtMs: null,
    resolvedAtMs: null,
    failedAtMs: null,
    controlValues,
    values: scenario.initialValues,
    componentHealth: scenario.initialComponentHealth,
    triggers: {},
    customerImpact: {
      revenueLossUsd: 0,
      totalTimeInCriticalMs: 0,
      totalTimeInDegradedMs: 0,
    },
    cost: {
      currentMonthlyCostUsd: scenario.infrastructureCost.baselineMonthlyUsd,
    },
    transitions: {
      matchedRuleId: null,
      incidentState: "healthy",
      consecutiveSuccessSeconds: 0,
      consecutiveFailureSeconds: 0,
      severityAnnounced,
      thresholdAnnounced,
      nextTimedEventIndex: 0,
    },
    peaks: {
      peakSeverityRank: 0,
      peakValues,
      peakMonthlyCostUsd: scenario.infrastructureCost.baselineMonthlyUsd,
    },
    numberOfConfigurationChanges: 0,
    numberOfHarmfulChanges: 0,
    numberOfBeneficialChanges: 0,
  };
}

function applyAction(
  scenario: ScenarioSimulationDefinition,
  state: SimulationState,
  action: CandidateAction,
): { state: SimulationState; events: SimulationEvent[] } {
  const valid = isValidControlValue(
    scenario.controls,
    action.controlKey,
    action.value,
  );

  if (!valid) {
    return {
      state,
      events: [
        {
          id: `evt-${action.timestampMs}-${action.id}-rejected`,
          timestampMs: action.timestampMs,
          type: "CONFIG_CHANGE_REJECTED",
          message: `Rejected invalid value for ${action.controlKey}.`,
          metadata: { controlKey: action.controlKey, attemptedValue: action.value },
        },
      ],
    };
  }

  const previousValue = state.controlValues[action.controlKey];
  const outcome = classifyAction(
    scenario.actionClassifications,
    action.controlKey,
    action.value,
    state.triggers,
  );

  return {
    state: {
      ...state,
      controlValues: {
        ...state.controlValues,
        [action.controlKey]: action.value,
      },
      numberOfConfigurationChanges: state.numberOfConfigurationChanges + 1,
      numberOfHarmfulChanges:
        state.numberOfHarmfulChanges + (outcome === "harmful" ? 1 : 0),
      numberOfBeneficialChanges:
        state.numberOfBeneficialChanges + (outcome === "beneficial" ? 1 : 0),
    },
    events: [
      {
        id: `evt-${action.timestampMs}-${action.id}`,
        timestampMs: action.timestampMs,
        type: "CONFIG_CHANGED",
        message: `${action.controlKey} changed.`,
        metadata: {
          target: action.controlKey,
          field: action.controlKey,
          previousValue,
          newValue: action.value,
          outcome,
        },
      },
    ],
  };
}

/**
 * Advances the simulation by `elapsedMs`, applying `action` first (if any).
 * Larger elapsed times are processed as deterministic one-tick steps, so
 * simulate(state, null, 5000) is equivalent to five successive one-tick
 * calls with tickMs = 1000.
 */
export function simulate(
  scenario: ScenarioSimulationDefinition,
  state: SimulationState,
  action: CandidateAction | null,
  elapsedMs: number,
): SimulationResult {
  let currentState = state;
  const events: SimulationEvent[] = [];

  if (action) {
    const applied = applyAction(scenario, currentState, action);
    currentState = applied.state;
    events.push(...applied.events);
  }

  const tickCount = Math.floor(elapsedMs / scenario.tickMs);
  for (let i = 0; i < tickCount; i += 1) {
    const tickResult = tickOnce(scenario, currentState);
    currentState = tickResult.state;
    events.push(...tickResult.events);
  }

  return { state: currentState, events };
}
