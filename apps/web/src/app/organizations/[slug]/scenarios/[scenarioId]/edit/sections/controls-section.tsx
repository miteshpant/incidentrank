"use client";

import type {
  AuthoredControl,
  AuthoredControlType,
  AuthoredScenario,
  AuthoredScenarioValidationError,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

function blankControl(): AuthoredControl {
  return {
    key: "",
    label: "",
    type: "select",
    allowedValues: [],
    initialValue: "",
    componentId: "",
  };
}

interface ControlsSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function ControlsSection({ authored, errors, disabled, onChange }: ControlsSectionProps) {
  const addControl = () => {
    onChange((prev) => ({ ...prev, controls: [...prev.controls, blankControl()] }));
  };

  const updateControl = (index: number, patch: Partial<AuthoredControl>) => {
    onChange((prev) => ({
      ...prev,
      controls: prev.controls.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const removeControl = (index: number) => {
    onChange((prev) => ({ ...prev, controls: prev.controls.filter((_, i) => i !== index) }));
  };

  const setAllowedValuesText = (index: number, text: string) => {
    const values = text
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .map((v) => (Number.isNaN(Number(v)) ? v : Number(v)));
    updateControl(index, { allowedValues: values });
  };

  const setControlType = (index: number, type: AuthoredControlType) => {
    if (type === "toggle") {
      updateControl(index, { type, allowedValues: [false, true], initialValue: false });
    } else {
      updateControl(index, { type, allowedValues: [], initialValue: "" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Controls</h2>
      <SectionErrors errors={errors} />

      <div className="flex flex-col gap-4">
        {authored.controls.map((control, index) => (
          <div key={index} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-mono text-xs text-muted">Key</label>
                <input
                  type="text"
                  value={control.key}
                  disabled={disabled}
                  onChange={(e) => updateControl(index, { key: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                />
              </div>
              <div className="flex-1">
                <label className="font-mono text-xs text-muted">Label</label>
                <input
                  type="text"
                  value={control.label}
                  disabled={disabled}
                  onChange={(e) => updateControl(index, { label: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                />
              </div>
              <div>
                <label className="font-mono text-xs text-muted">Type</label>
                <select
                  value={control.type}
                  disabled={disabled}
                  onChange={(e) => setControlType(index, e.target.value as AuthoredControlType)}
                  className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                >
                  <option value="select">select</option>
                  <option value="toggle">toggle</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-mono text-xs text-muted">Component Id</label>
                <input
                  type="text"
                  value={control.componentId}
                  disabled={disabled}
                  placeholder="matches an architecture node id"
                  onChange={(e) => updateControl(index, { componentId: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:border-foreground/40 disabled:opacity-60"
                />
              </div>

              {control.type === "select" ? (
                <>
                  <div className="flex-1">
                    <label className="font-mono text-xs text-muted">Allowed Values (comma-separated)</label>
                    <input
                      type="text"
                      defaultValue={control.allowedValues.join(", ")}
                      disabled={disabled}
                      onBlur={(e) => setAllowedValuesText(index, e.target.value)}
                      className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="font-mono text-xs text-muted">Initial Value</label>
                    <select
                      value={String(control.initialValue)}
                      disabled={disabled}
                      onChange={(e) => {
                        const matched = control.allowedValues.find((v) => String(v) === e.target.value);
                        if (matched !== undefined) updateControl(index, { initialValue: matched });
                      }}
                      className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                    >
                      {control.allowedValues.map((v) => (
                        <option key={String(v)} value={String(v)}>
                          {String(v)}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="font-mono text-xs text-muted">Initial Value</label>
                  <select
                    value={String(control.initialValue)}
                    disabled={disabled}
                    onChange={(e) => updateControl(index, { initialValue: e.target.value === "true" })}
                    className="mt-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                  >
                    <option value="false">false</option>
                    <option value="true">true</option>
                  </select>
                </div>
              )}
            </div>

            {!disabled && (
              <button
                type="button"
                onClick={() => removeControl(index)}
                className="self-start font-mono text-xs text-muted hover:text-[#dc2626]"
              >
                Remove Control
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={addControl}
            className="self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            + Add Control
          </button>
        )}
      </div>
    </div>
  );
}
