"use client";

import type { StateValue } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import { formatMetricValue, metricSeverity } from "./candidate-ui-format";
import { formatUsd } from "@/lib/format";

type Severity = "normal" | "warning" | "critical";

const SEVERITY_LABEL: Record<Severity, string> = {
  normal: "Normal",
  warning: "Warning",
  critical: "Critical",
};

const SEVERITY_TEXT_CLASS: Record<Severity, string> = {
  normal: "text-accent",
  warning: "text-[#d97706]",
  critical: "text-[#dc2626]",
};

interface MetricRowProps {
  label: string;
  value: string;
  severity: Severity;
  previousValue?: string;
  showSeverityBadge: boolean;
}

function MetricRow({ label, value, severity, previousValue, showSeverityBadge }: MetricRowProps) {
  const changed = previousValue !== undefined && previousValue !== value;

  return (
    <div className="flex items-baseline justify-between border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-baseline gap-2 font-mono text-sm">
        {changed && (
          <span className="text-muted" aria-hidden="true">
            {previousValue} →
          </span>
        )}
        <span className={showSeverityBadge ? SEVERITY_TEXT_CLASS[severity] : undefined}>{value}</span>
        {showSeverityBadge && (
          <span className={`text-[10px] uppercase tracking-wide ${SEVERITY_TEXT_CLASS[severity]}`}>
            {SEVERITY_LABEL[severity]}
          </span>
        )}
      </span>
    </div>
  );
}

interface GenericMetricsPanelProps {
  descriptor: CandidateUIDescriptor;
  values: Record<string, StateValue>;
  previousValues: Record<string, StateValue> | null;
  revenueLossUsd: number;
}

/**
 * Candidate-facing live-metrics display, driven entirely by a
 * CandidateUIDescriptor (authored metrics[] for org scenarios, or
 * paymentRetryStormCandidateUI for the built-in scenario) rather than a
 * hardcoded field list — this is what lets the same component serve any
 * scenario. "status"-format metrics (e.g. paymentTraffic, dbPressure) get
 * full normal/warning/critical severity coloring, since their value IS
 * the severity. Numeric metrics (percentage/duration/currency/number)
 * render without severity coloring — authoring per-metric numeric
 * thresholds is out of Phase 5's metric-authoring scope (spec section 5
 * limits metrics to format only, no arbitrary threshold expressions), so
 * fidelity with Payment Retry Storm's old hardcoded
 * successRate/p99-threshold coloring is intentionally not preserved here.
 */
export function GenericMetricsPanel({
  descriptor,
  values,
  previousValues,
  revenueLossUsd,
}: GenericMetricsPanelProps) {
  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
        Live Metrics
      </h2>
      <div className="mt-3">
        {descriptor.metrics.map((metric) => {
          const value = values[metric.sourceStateKey];
          const previousValue = previousValues?.[metric.sourceStateKey];
          const severity = metricSeverity(value, metric.format);

          return (
            <MetricRow
              key={metric.key}
              label={metric.label}
              value={formatMetricValue(value, metric.format)}
              severity={severity}
              showSeverityBadge={metric.format === "status"}
              previousValue={
                previousValues ? formatMetricValue(previousValue, metric.format) : undefined
              }
            />
          );
        })}
      </div>

      <div className="mt-6 rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Estimated Revenue Impact
        </p>
        <p className="mt-1 text-xl font-semibold tracking-tight">
          {formatUsd(revenueLossUsd)}
        </p>
      </div>
    </div>
  );
}
