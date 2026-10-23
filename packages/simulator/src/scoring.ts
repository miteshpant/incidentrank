import type { ScoringInputs, SimulationState, StateValue } from "./types";

function toNumericValues(values: Record<string, StateValue>): Record<string, number> {
  const numeric: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "number") numeric[key] = value;
  }
  return numeric;
}

function toStringValues(values: Record<string, StateValue>): Record<string, string> {
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") strings[key] = value;
  }
  return strings;
}

export interface ExtractScoringInputsOptions {
  /**
   * Candidate-declared Finish never mutates engine state, so
   * state.resolvedAtMs stays null even for a resolved outcome (see
   * docs/implementation_plan/phase6.1.md). When the caller has derived the
   * moment the accepted completion tier actually became sustained-true, it
   * passes that here so the generic scorer's existing resolvedAtMs-based
   * measures (recoveryTimeSeconds, criticalTimeRatio, terminalOverrides,
   * naturalRecoveryCondition) keep working unchanged. Never used to
   * override failedAtMs — failure is always engine-derived.
   */
  resolvedAtMsOverride?: number;
}

export function extractScoringInputs(
  scenario: { infrastructureCost: { baselineMonthlyUsd: number } },
  state: SimulationState,
  options: ExtractScoringInputsOptions = {},
): ScoringInputs {
  return {
    incidentStartedAtMs: state.incidentStartedAtMs,
    resolvedAtMs: options.resolvedAtMsOverride ?? state.resolvedAtMs,
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
    finalStringValues: toStringValues(state.values),
  };
}
