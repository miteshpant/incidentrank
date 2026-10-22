import type { ScoringInputs, SimulationState, StateValue } from "./types";

function toNumericValues(values: Record<string, StateValue>): Record<string, number> {
  const numeric: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number") numeric[key] = value;
  }
  return numeric;
}

export function extractScoringInputs(
  scenario: { infrastructureCost: { baselineMonthlyUsd: number } },
  state: SimulationState,
): ScoringInputs {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: state.resolvedAtMs,
    failedAtMs: state.failedAtMs,

    totalTimeInCriticalMs: state.customerImpact.totalTimeInCriticalMs,
    totalTimeInDegradedMs: state.customerImpact.totalTimeInDegradedMs,

    revenueLossUsd: state.customerImpact.revenueLossUsd,

    peakSeverityRank: state.peaks.peakSeverityRank,

    numberOfConfigurationChanges: state.numberOfConfigurationChanges,
    numberOfHarmfulChanges: state.numberOfHarmfulChanges,
    numberOfBeneficialChanges: state.numberOfBeneficialChanges,

    initialMonthlyInfrastructureCostUsd: scenario.infrastructureCost.baselineMonthlyUsd,
    finalMonthlyInfrastructureCostUsd: state.cost.currentMonthlyCostUsd,
    peakMonthlyInfrastructureCostUsd: state.peaks.peakMonthlyCostUsd,

    finalNumericValues: toNumericValues(state.values),
    peakNumericValues: state.peaks.peakValues,
  };
}
