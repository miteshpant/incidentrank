"use client";

import type {
  AuthoredMetric,
  AuthoredMetricFormat,
  AuthoredScenario,
  AuthoredScenarioValidationError,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

const FORMATS: AuthoredMetricFormat[] = ["number", "percentage", "duration", "currency", "status"];

function blankMetric(): AuthoredMetric {
  return { key: "", label: "", sourceStateKey: "", format: "number" };
}

interface MetricsSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function MetricsSection({ authored, errors, disabled, onChange }: MetricsSectionProps) {
  const addMetric = () => {
    onChange((prev) => ({ ...prev, metrics: [...prev.metrics, blankMetric()] }));
  };
  const updateMetric = (index: number, patch: Partial<AuthoredMetric>) => {
    onChange((prev) => ({
      ...prev,
      metrics: prev.metrics.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  };
  const removeMetric = (index: number) => {
    onChange((prev) => ({ ...prev, metrics: prev.metrics.filter((_, i) => i !== index) }));
  };

  const stateKeys = Object.keys(authored.initialState);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Metrics</h2>
      <p className="text-sm text-muted">
        Candidate-visible metrics. Each reads its live value from an Initial State key.
      </p>
      <SectionErrors errors={errors} />

      <div className="flex flex-col gap-3">
        {authored.metrics.map((metric, index) => (
          <div key={index} className="flex items-center gap-2 rounded-md border border-border bg-surface p-3">
            <input
              type="text"
              value={metric.key}
              disabled={disabled}
              placeholder="key"
              onChange={(e) => updateMetric(index, { key: e.target.value })}
              className="w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
            />
            <input
              type="text"
              value={metric.label}
              disabled={disabled}
              placeholder="Label"
              onChange={(e) => updateMetric(index, { label: e.target.value })}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
            />
            <select
              value={metric.sourceStateKey}
              disabled={disabled}
              onChange={(e) => updateMetric(index, { sourceStateKey: e.target.value })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
            >
              <option value="">source state key…</option>
              {stateKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              value={metric.format}
              disabled={disabled}
              onChange={(e) => updateMetric(index, { format: e.target.value as AuthoredMetricFormat })}
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            {!disabled && (
              <button
                type="button"
                onClick={() => removeMetric(index)}
                className="font-mono text-xs text-muted hover:text-[#dc2626]"
              >
                Remove
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={addMetric}
            className="self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            + Add Metric
          </button>
        )}
      </div>
    </div>
  );
}
