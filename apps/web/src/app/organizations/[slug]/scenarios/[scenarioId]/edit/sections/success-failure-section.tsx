"use client";

import type {
  AuthoredComparisonOperator,
  AuthoredOutcomeCondition,
  AuthoredScenario,
  AuthoredScenarioValidationError,
  AuthoredStateCondition,
  AuthoredStateValue,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

const OPERATORS: AuthoredComparisonOperator[] = [
  "equals",
  "not_equals",
  "less_than",
  "less_than_or_equal",
  "greater_than",
  "greater_than_or_equal",
];

function coerce(value: string): AuthoredStateValue {
  return Number.isNaN(Number(value)) || value.trim() === "" ? value : Number(value);
}

function blankCondition(): AuthoredStateCondition {
  return { key: "", source: "value", operator: "greater_than_or_equal", comparedTo: 0 };
}

interface SuccessFailureSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function SuccessFailureSection({ authored, errors, disabled, onChange }: SuccessFailureSectionProps) {
  const stateKeys = Object.keys(authored.initialState);
  const triggerKeys = Array.from(
    new Set(authored.timelineEvents.flatMap((e) => Object.keys(e.setTriggers ?? {}))),
  );

  return (
    <div className="flex flex-col gap-8">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Success / Failure</h2>
      <SectionErrors errors={errors} />

      <OutcomeEditor
        title="Success Condition"
        outcome={authored.successCondition}
        stateKeys={stateKeys}
        triggerKeys={triggerKeys}
        disabled={disabled}
        onChange={(outcomeUpdater) =>
          onChange((prev) => ({ ...prev, successCondition: outcomeUpdater(prev.successCondition) }))
        }
      />

      <OutcomeEditor
        title="Failure Condition"
        outcome={authored.failureCondition}
        stateKeys={stateKeys}
        triggerKeys={triggerKeys}
        disabled={disabled}
        onChange={(outcomeUpdater) =>
          onChange((prev) => ({ ...prev, failureCondition: outcomeUpdater(prev.failureCondition) }))
        }
      />
    </div>
  );
}

function OutcomeEditor({
  title,
  outcome,
  stateKeys,
  triggerKeys,
  disabled,
  onChange,
}: {
  title: string;
  outcome: AuthoredOutcomeCondition;
  stateKeys: string[];
  triggerKeys: string[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredOutcomeCondition) => AuthoredOutcomeCondition) => void;
}) {
  const updateCondition = (index: number, patch: Partial<AuthoredStateCondition>) => {
    onChange((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  };

  const addCondition = () => {
    onChange((prev) => ({ ...prev, conditions: [...prev.conditions, blankCondition()] }));
  };
  const removeCondition = (index: number) => {
    onChange((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== index) }));
  };

  return (
    <div>
      <h3 className="text-sm font-medium">{title}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {outcome.conditions.map((condition, index) => (
          <div key={index} className="flex items-center gap-2 rounded-md border border-border bg-surface p-2">
            <select
              value={condition.source ?? "value"}
              disabled={disabled}
              onChange={(e) => updateCondition(index, { source: e.target.value as "value" | "trigger" })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
            >
              <option value="value">state value</option>
              <option value="trigger">trigger</option>
            </select>
            <select
              value={condition.key}
              disabled={disabled}
              onChange={(e) => updateCondition(index, { key: e.target.value })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
            >
              <option value="">key…</option>
              {((condition.source ?? "value") === "value" ? stateKeys : triggerKeys).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <select
              value={condition.operator}
              disabled={disabled}
              onChange={(e) => updateCondition(index, { operator: e.target.value as AuthoredComparisonOperator })}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
            >
              {OPERATORS.map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={String(condition.comparedTo)}
              disabled={disabled}
              onChange={(e) => updateCondition(index, { comparedTo: coerce(e.target.value) })}
              className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
            />
            {!disabled && (
              <button
                type="button"
                onClick={() => removeCondition(index)}
                className="font-mono text-[10px] text-muted hover:text-[#dc2626]"
              >
                ×
              </button>
            )}
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={addCondition}
            className="self-start rounded-md border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40"
          >
            + Add Condition
          </button>
        )}

        <div className="mt-2 flex items-center gap-2">
          <label className="font-mono text-xs text-muted">Must remain true for (seconds)</label>
          <input
            type="number"
            min={0}
            value={outcome.sustainedSeconds}
            disabled={disabled}
            onChange={(e) => {
              const value = Number(e.target.value);
              onChange((prev) => ({ ...prev, sustainedSeconds: value }));
            }}
            className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
          />
        </div>
      </div>
    </div>
  );
}
