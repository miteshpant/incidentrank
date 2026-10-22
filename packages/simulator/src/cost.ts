import type {
  ControlValue,
  InfrastructureCostConfig,
} from "./types";

/**
 * Authored monthly infrastructure cost: a baseline plus a per-unit increment
 * for every control whose current value participates in cost. A control
 * participates in cost when `perUnitMonthlyUsd` has an entry keyed
 * `${controlKey}:${value}`.
 */
export function computeMonthlyCost(
  config: InfrastructureCostConfig,
  controlValues: Record<string, ControlValue>,
): number {
  let total = config.baselineMonthlyUsd;

  for (const [controlKey, value] of Object.entries(controlValues)) {
    const costKey = `${controlKey}:${value}`;
    const increment = config.perUnitMonthlyUsd[costKey];
    if (increment !== undefined) {
      total += increment;
    }
  }

  return Math.max(0, total);
}
