"use client";

import { useId, useState } from "react";
import type {
  ComponentHealth,
  ControlDefinition,
  ControlValue,
  SimulationState,
} from "@incidentrank/simulator";
import {
  COMPONENT_CONTROL_KEYS,
  COMPONENT_LABELS,
  CONTROL_LABELS,
  formatControlValue,
} from "@/lib/payment-retry-storm-ui";
import { formatMs, formatNumber } from "@/lib/format";

const REASONING_MAX_LENGTH = 1000;

interface ObservabilityRow {
  label: string;
  value: string;
}

function buildObservabilityRows(
  componentId: string,
  state: SimulationState,
): ObservabilityRow[] {
  const health = state.componentHealth[componentId] ?? "healthy";
  const healthLabel: Record<ComponentHealth, string> = {
    healthy: "Healthy",
    degraded: "Degraded",
    critical: "Critical",
  };

  if (componentId === "payment-provider") {
    const paymentProviderLatencyMs = state.values.paymentProviderLatencyMs;
    return [
      { label: "Health", value: healthLabel[health] },
      {
        label: "Latency",
        value: formatMs(
          typeof paymentProviderLatencyMs === "number" ? paymentProviderLatencyMs : 0,
        ),
      },
    ];
  }

  if (componentId === "api-gateway" || componentId === "settlement-worker") {
    return [{ label: "Health", value: healthLabel[health] }];
  }

  if (componentId === "postgres") {
    return [{ label: "Pressure", value: String(state.values.dbPressure) }];
  }

  if (componentId === "kafka") {
    const kafkaLagMessages = state.values.kafkaLagMessages;
    return [
      {
        label: "Lag",
        value: formatNumber(typeof kafkaLagMessages === "number" ? kafkaLagMessages : 0),
      },
    ];
  }

  return [{ label: "Health", value: healthLabel[health] }];
}

interface ComponentPanelProps {
  componentId: string;
  controls: ControlDefinition[];
  state: SimulationState;
  pendingControlValues: Record<string, ControlValue>;
  hasPendingChanges: boolean;
  disabled: boolean;
  incidentStarted: boolean;
  onChangePendingValue: (controlKey: string, value: ControlValue) => void;
  onApplyChanges: (reasoning: string) => void;
}

export function ComponentPanel({
  componentId,
  controls,
  state,
  pendingControlValues,
  hasPendingChanges,
  disabled,
  incidentStarted,
  onChangePendingValue,
  onApplyChanges,
}: ComponentPanelProps) {
  const controlKeys = COMPONENT_CONTROL_KEYS[componentId] ?? [];
  const componentControls = controls.filter((control) =>
    controlKeys.includes(control.key),
  );
  const observabilityRows = buildObservabilityRows(componentId, state);
  const label = COMPONENT_LABELS[componentId] ?? componentId;
  const reasoningFieldId = useId();

  const [reasoning, setReasoning] = useState("");
  const controlsLocked = disabled || !incidentStarted;

  return (
    <div>
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">
        {label}
      </h2>

      <div className="mt-3 rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Observability
        </p>
        <dl className="mt-2 flex flex-col gap-1">
          {observabilityRows.map((row) => (
            <div key={row.label} className="flex justify-between text-sm">
              <dt className="text-muted">{row.label}</dt>
              <dd className="font-mono">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {componentControls.length > 0 && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyChanges(reasoning);
            setReasoning("");
          }}
        >
          {componentControls.map((control) => {
            const fieldId = `control-${control.key}`;
            const currentValue =
              pendingControlValues[control.key] ?? control.initialValue;

            return (
              <div key={control.key} className="flex flex-col gap-1">
                <label
                  htmlFor={fieldId}
                  className="font-mono text-xs text-muted"
                >
                  {CONTROL_LABELS[control.key] ?? control.key}
                </label>
                <select
                  id={fieldId}
                  value={String(currentValue)}
                  disabled={controlsLocked}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const matched = control.allowedValues.find(
                      (allowed) => String(allowed) === raw,
                    );
                    if (matched !== undefined) {
                      onChangePendingValue(control.key, matched);
                    }
                  }}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {control.allowedValues.map((allowed) => (
                    <option key={String(allowed)} value={String(allowed)}>
                      {formatControlValue(control.key, allowed)}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}

          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={reasoningFieldId}
                className="font-mono text-xs text-muted"
              >
                Why are you making this change?
              </label>
              <span className="font-mono text-[10px] text-muted">
                {reasoning.length}/{REASONING_MAX_LENGTH}
              </span>
            </div>
            <textarea
              id={reasoningFieldId}
              value={reasoning}
              disabled={controlsLocked}
              maxLength={REASONING_MAX_LENGTH}
              rows={3}
              placeholder="Explain what you think is happening and why this change may help."
              onChange={(event) => setReasoning(event.target.value)}
              className="resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60"
            />
          </div>

          {!incidentStarted && (
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Controls unlock when the incident begins.
            </p>
          )}

          <button
            type="submit"
            disabled={controlsLocked || !hasPendingChanges}
            className="mt-2 rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply Changes
          </button>
        </form>
      )}
    </div>
  );
}
