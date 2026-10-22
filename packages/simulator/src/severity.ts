import type { SeverityFieldConfig, SeverityLevel, StateValue } from "./types";

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  normal: 0,
  warning: 1,
  critical: 2,
};

function isSeverityLevel(value: StateValue): value is SeverityLevel {
  return value === "normal" || value === "warning" || value === "critical";
}

/**
 * A single authored severity rank for peak-tracking purposes, derived from
 * the worst of the scenario's declared severity fields. This is
 * bookkeeping only — it does not drive incident state or resolution
 * logic. Generalizes the old hardcoded max(paymentTraffic, dbPressure).
 */
export function severityRank(
  severityFields: SeverityFieldConfig[],
  values: Record<string, StateValue>,
): number {
  let rank = 0;
  for (const field of severityFields) {
    const value = values[field.key];
    if (value !== undefined && isSeverityLevel(value)) {
      rank = Math.max(rank, SEVERITY_RANK[value]);
    }
  }
  return rank;
}
