import type { StateValue } from "@incidentrank/simulator";
import type { CandidateMetricFormat } from "@incidentrank/scenarios";
import { formatMs, formatNumber, formatPercent, formatUsd } from "@/lib/format";

/** Formats a state value for display according to its authored/built-in metric format. */
export function formatMetricValue(value: StateValue | undefined, format: CandidateMetricFormat): string {
  if (format === "status") {
    return typeof value === "string" ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
  }

  const numeric = typeof value === "number" ? value : 0;
  switch (format) {
    case "percentage":
      return formatPercent(numeric);
    case "duration":
      return formatMs(numeric);
    case "currency":
      return formatUsd(numeric);
    case "number":
    default:
      return formatNumber(numeric);
  }
}

/** Severity derived from a status-format metric's raw value — "normal"/"warning"/"critical" string states map directly; numeric formats fall back to neutral. */
export function metricSeverity(
  value: StateValue | undefined,
  format: CandidateMetricFormat,
): "normal" | "warning" | "critical" {
  if (format !== "status") return "normal";
  return value === "warning" || value === "critical" ? value : "normal";
}
