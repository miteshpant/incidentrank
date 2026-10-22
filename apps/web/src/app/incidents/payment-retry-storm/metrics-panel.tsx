"use client";

import type { StateValue } from "@incidentrank/simulator";
import { formatMs, formatNumber, formatPercent, formatUsd } from "@/lib/format";

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

function successRateSeverity(rate: number): Severity {
  if (rate < 75) return "critical";
  if (rate < 95) return "warning";
  return "normal";
}

function p99Severity(ms: number): Severity {
  if (ms > 8000) return "critical";
  if (ms > 3000) return "warning";
  return "normal";
}

function asSeverity(value: StateValue | undefined): Severity {
  return value === "warning" || value === "critical" ? value : "normal";
}

function asNumber(value: StateValue | undefined): number {
  return typeof value === "number" ? value : 0;
}

interface MetricRowProps {
  label: string;
  value: string;
  severity: Severity;
  previousValue?: string;
}

function MetricRow({ label, value, severity, previousValue }: MetricRowProps) {
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
        <span className={SEVERITY_TEXT_CLASS[severity]}>{value}</span>
        <span
          className={`text-[10px] uppercase tracking-wide ${SEVERITY_TEXT_CLASS[severity]}`}
        >
          {SEVERITY_LABEL[severity]}
        </span>
      </span>
    </div>
  );
}

interface MetricsPanelProps {
  values: Record<string, StateValue>;
  previousValues: Record<string, StateValue> | null;
  revenueLossUsd: number;
}

/**
 * Payment Retry Storm's live-metrics display. Reads from the engine's
 * generic `values` bag rather than a fixed AuthoredMetrics shape (Phase 5
 * generalization) — this panel itself remains scenario-specific UI, per
 * the spec's "candidate rendering can continue using the current
 * architecture view" allowance; only the engine underneath it is generic.
 */
export function MetricsPanel({
  values,
  previousValues,
  revenueLossUsd,
}: MetricsPanelProps) {
  const checkoutSuccessRate = asNumber(values.checkoutSuccessRate);
  const checkoutP99LatencyMs = asNumber(values.checkoutP99LatencyMs);
  const paymentProviderLatencyMs = asNumber(values.paymentProviderLatencyMs);
  const paymentTraffic = asSeverity(values.paymentTraffic);
  const dbPressure = asSeverity(values.dbPressure);
  const kafkaLagMessages = asNumber(values.kafkaLagMessages);

  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
        Live Metrics
      </h2>
      <div className="mt-3">
        <MetricRow
          label="Checkout Success"
          value={formatPercent(checkoutSuccessRate)}
          severity={successRateSeverity(checkoutSuccessRate)}
          previousValue={
            previousValues
              ? formatPercent(asNumber(previousValues.checkoutSuccessRate))
              : undefined
          }
        />
        <MetricRow
          label="Checkout P99"
          value={formatMs(checkoutP99LatencyMs)}
          severity={p99Severity(checkoutP99LatencyMs)}
          previousValue={
            previousValues
              ? formatMs(asNumber(previousValues.checkoutP99LatencyMs))
              : undefined
          }
        />
        <MetricRow
          label="Provider Latency"
          value={formatMs(paymentProviderLatencyMs)}
          severity={p99Severity(paymentProviderLatencyMs)}
        />
        <MetricRow
          label="Payment Traffic"
          value={SEVERITY_LABEL[paymentTraffic]}
          severity={paymentTraffic}
        />
        <MetricRow
          label="DB Pressure"
          value={SEVERITY_LABEL[dbPressure]}
          severity={dbPressure}
        />
        <MetricRow
          label="Kafka Lag"
          value={formatNumber(kafkaLagMessages)}
          severity={kafkaLagMessages >= 10_000 ? "warning" : "normal"}
        />
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
