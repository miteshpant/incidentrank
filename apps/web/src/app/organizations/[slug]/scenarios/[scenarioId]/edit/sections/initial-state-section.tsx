"use client";

import type { AuthoredScenario, AuthoredScenarioValidationError, AuthoredStateValue } from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

interface InitialStateSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

function coerce(value: string): AuthoredStateValue {
  return Number.isNaN(Number(value)) || value.trim() === "" ? value : Number(value);
}

export function InitialStateSection({ authored, errors, disabled, onChange }: InitialStateSectionProps) {
  const entries = Object.entries(authored.initialState);

  const addRow = () => {
    onChange((prev) => {
      let key = "newField";
      let suffix = 1;
      while (key in prev.initialState) {
        key = `newField${suffix}`;
        suffix += 1;
      }
      return { ...prev, initialState: { ...prev.initialState, [key]: 0 } };
    });
  };

  const renameKey = (oldKey: string, newKey: string) => {
    if (newKey === oldKey || newKey.trim() === "") return;
    onChange((prev) => {
      const next: Record<string, AuthoredStateValue> = {};
      for (const [k, v] of Object.entries(prev.initialState)) {
        next[k === oldKey ? newKey : k] = v;
      }
      return { ...prev, initialState: next };
    });
  };

  const updateValue = (key: string, value: string) => {
    onChange((prev) => ({
      ...prev,
      initialState: { ...prev.initialState, [key]: coerce(value) },
    }));
  };

  const removeRow = (key: string) => {
    onChange((prev) => {
      const next = { ...prev.initialState };
      delete next[key];
      return { ...prev, initialState: next };
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Initial State</h2>
      <p className="text-sm text-muted">
        State keys used here must match the keys referenced by metrics, rules, and
        success/failure conditions.
      </p>
      <SectionErrors errors={errors} />

      <div className="flex flex-col gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <input
              type="text"
              defaultValue={key}
              disabled={disabled}
              onBlur={(e) => renameKey(key, e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
            />
            <input
              type="text"
              defaultValue={String(value)}
              disabled={disabled}
              onBlur={(e) => updateValue(key, e.target.value)}
              className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => removeRow(key)}
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
            onClick={addRow}
            className="mt-2 self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            + Add Field
          </button>
        )}
      </div>
    </div>
  );
}
