"use client";

import { useId, useState } from "react";
import type {
  ComponentHealth,
  ControlDefinition,
  ControlValue,
  SimulationState,
} from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";

const REASONING_MAX_LENGTH = 1000;

const HEALTH_LABEL: Record<ComponentHealth, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  critical: "Critical",
};

interface GenericComponentPanelProps {
  componentId: string;
  descriptor: CandidateUIDescriptor;
  controls: ControlDefinition[];
  state: SimulationState;
  pendingControlValues: Record<string, ControlValue>;
  hasPendingChanges: boolean;
  disabled: boolean;
  incidentStarted: boolean;
  onChangePendingValue: (controlKey: string, value: ControlValue) => void;
  onApplyChanges: (reasoning: string) => void;
}

/**
 * Candidate-facing component detail panel, driven by a
 * CandidateUIDescriptor rather than hardcoded per-component observability
 * (the old Payment-Retry-Storm-specific version showed e.g. "Latency" for
 * payment-provider, "Pressure" for postgres — none of that is
 * generically authorable). This generic version shows component health
 * only; richer live metrics are already visible in the Live Metrics
 * panel above it, so no information is lost, just reorganized.
 */
export function GenericComponentPanel({
  componentId,
  descriptor,
  controls,
  state,
  pendingControlValues,
  hasPendingChanges,
  disabled,
  incidentStarted,
  onChangePendingValue,
  onApplyChanges,
}: GenericComponentPanelProps) {
  const controlDescriptorsForComponent = descriptor.controls.filter(
    (c) => c.componentId === componentId,
  );
  const componentControlKeys = new Set(controlDescriptorsForComponent.map((c) => c.key));
  const componentControls = controls.filter((control) => componentControlKeys.has(control.key));

  const health = state.componentHealth[componentId] ?? "healthy";
  const label = descriptor.components.find((c) => c.id === componentId)?.label ?? componentId;
  const reasoningFieldId = useId();

  const [reasoning, setReasoning] = useState("");
  const controlsLocked = disabled || !incidentStarted;

  const valueLabel = (controlKey: string, value: ControlValue): string => {
    const controlDescriptor = controlDescriptorsForComponent.find((c) => c.key === controlKey);
    return controlDescriptor?.valueLabels?.[String(value)] ?? String(value);
  };

  const controlLabel = (controlKey: string): string =>
    controlDescriptorsForComponent.find((c) => c.key === controlKey)?.label ?? controlKey;

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
          <div className="flex justify-between text-sm">
            <dt className="text-muted">Health</dt>
            <dd className="font-mono">{HEALTH_LABEL[health]}</dd>
          </div>
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
                  {controlLabel(control.key)}
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
                      {valueLabel(control.key, allowed)}
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
