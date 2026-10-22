"use client";

import type {
  AuthoredRule,
  AuthoredRuleCondition,
  AuthoredRuleConditionOperator,
  AuthoredScenario,
  AuthoredScenarioValidationError,
  AuthoredStateValue,
} from "@incidentrank/scenarios/authoring";
import { SectionErrors } from "./section-errors";

function blankRule(index: number): AuthoredRule {
  return { id: `rule-${index}`, when: [], incidentState: "", setValues: {} };
}

function blankCondition(): AuthoredRuleCondition {
  return { source: "trigger", key: "", equals: true };
}

function coerce(value: string): AuthoredStateValue {
  return Number.isNaN(Number(value)) || value.trim() === "" ? value : Number(value);
}

interface RulesSectionProps {
  authored: AuthoredScenario;
  errors: AuthoredScenarioValidationError[];
  disabled: boolean;
  onChange: (updater: (prev: AuthoredScenario) => AuthoredScenario) => void;
}

export function RulesSection({ authored, errors, disabled, onChange }: RulesSectionProps) {
  const addRule = () => {
    onChange((prev) => ({ ...prev, rules: [...prev.rules, blankRule(prev.rules.length)] }));
  };

  const updateRule = (index: number, patch: Partial<AuthoredRule>) => {
    onChange((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    }));
  };

  const removeRule = (index: number) => {
    onChange((prev) => ({ ...prev, rules: prev.rules.filter((_, i) => i !== index) }));
  };

  const moveRule = (index: number, direction: -1 | 1) => {
    onChange((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.rules.length) return prev;
      const rules = [...prev.rules];
      [rules[index], rules[target]] = [rules[target]!, rules[index]!];
      return { ...prev, rules };
    });
  };

  const addCondition = (ruleIndex: number) => {
    onChange((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) =>
        i === ruleIndex ? { ...r, when: [...r.when, blankCondition()] } : r,
      ),
    }));
  };

  const updateCondition = (ruleIndex: number, condIndex: number, next: AuthoredRuleCondition) => {
    onChange((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) =>
        i === ruleIndex
          ? { ...r, when: r.when.map((c, j) => (j === condIndex ? next : c)) }
          : r,
      ),
    }));
  };

  const removeCondition = (ruleIndex: number, condIndex: number) => {
    onChange((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) =>
        i === ruleIndex ? { ...r, when: r.when.filter((_, j) => j !== condIndex) } : r,
      ),
    }));
  };

  const setValuesText = (ruleIndex: number, text: string) => {
    const setValues: Record<string, AuthoredStateValue> = {};
    for (const pair of text.split(",")) {
      const [key, value] = pair.split("=").map((s) => s.trim());
      if (key && value !== undefined) setValues[key] = coerce(value);
    }
    updateRule(ruleIndex, { setValues });
  };

  const valuesToText = (setValues: Record<string, AuthoredStateValue>): string =>
    Object.entries(setValues)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");

  const controlKeys = authored.controls.map((c) => c.key);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-mono text-xs uppercase tracking-wide text-muted">Rules & Consequences</h2>
      <p className="text-sm text-muted">
        Evaluated top-to-bottom; the first matching rule wins. More specific rules should
        usually appear before broader fallback rules. A rule with no conditions (empty WHEN)
        always matches and should be last — the required default/fallback.
      </p>
      <SectionErrors errors={errors} />

      <div className="flex flex-col gap-4">
        {authored.rules.map((rule, ruleIndex) => (
          <div key={ruleIndex} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wide text-muted">
                Rule {ruleIndex + 1}
              </span>
              {!disabled && (
                <div className="flex gap-2 font-mono text-xs">
                  <button type="button" onClick={() => moveRule(ruleIndex, -1)} className="text-muted hover:text-foreground">
                    Move Up
                  </button>
                  <button type="button" onClick={() => moveRule(ruleIndex, 1)} className="text-muted hover:text-foreground">
                    Move Down
                  </button>
                  <button type="button" onClick={() => removeRule(ruleIndex)} className="text-muted hover:text-[#dc2626]">
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="font-mono text-xs text-muted">Rule Id</label>
                <input
                  type="text"
                  value={rule.id}
                  disabled={disabled}
                  onChange={(e) => updateRule(ruleIndex, { id: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
                />
              </div>
              <div className="flex-1">
                <label className="font-mono text-xs text-muted">Incident State Label</label>
                <input
                  type="text"
                  value={rule.incidentState}
                  disabled={disabled}
                  placeholder="e.g. saturated, recovering, healthy"
                  onChange={(e) => updateRule(ruleIndex, { incidentState: e.target.value })}
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:border-foreground/40 disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <p className="font-mono text-xs uppercase tracking-wide text-muted">
                WHEN (all conditions must hold)
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {rule.when.map((condition, condIndex) => (
                  <ConditionRow
                    key={condIndex}
                    condition={condition}
                    controlKeys={controlKeys}
                    disabled={disabled}
                    onChange={(next) => updateCondition(ruleIndex, condIndex, next)}
                    onRemove={() => removeCondition(ruleIndex, condIndex)}
                  />
                ))}
                {rule.when.length === 0 && (
                  <p className="text-xs italic text-muted">No conditions — always matches (fallback).</p>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => addCondition(ruleIndex)}
                    className="self-start rounded-md border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40"
                  >
                    + Add Condition
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="font-mono text-xs uppercase tracking-wide text-muted">
                THEN — set state values (key=value, key2=value2)
              </label>
              <input
                type="text"
                defaultValue={valuesToText(rule.setValues)}
                disabled={disabled}
                onBlur={(e) => setValuesText(ruleIndex, e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground/40 disabled:opacity-60"
              />
            </div>
          </div>
        ))}

        {!disabled && (
          <button
            type="button"
            onClick={addRule}
            className="self-start rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            + Add Rule
          </button>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  condition,
  controlKeys,
  disabled,
  onChange,
  onRemove,
}: {
  condition: AuthoredRuleCondition;
  controlKeys: string[];
  disabled: boolean;
  onChange: (next: AuthoredRuleCondition) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
      <select
        value={condition.source}
        disabled={disabled}
        onChange={(e) =>
          onChange(
            e.target.value === "trigger"
              ? { source: "trigger", key: condition.key, equals: true }
              : { source: "control", key: condition.key, operator: "equals", comparedTo: "" },
          )
        }
        className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
      >
        <option value="trigger">trigger</option>
        <option value="control">control</option>
      </select>

      {condition.source === "trigger" ? (
        <>
          <input
            type="text"
            value={condition.key}
            disabled={disabled}
            placeholder="trigger key"
            onChange={(e) => onChange({ ...condition, key: e.target.value })}
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none placeholder:text-muted focus:border-foreground/40 disabled:opacity-60"
          />
          <span className="text-xs text-muted">equals</span>
          <select
            value={String(condition.equals)}
            disabled={disabled}
            onChange={(e) => onChange({ ...condition, equals: e.target.value === "true" })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
          >
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </>
      ) : (
        <>
          <select
            value={condition.key}
            disabled={disabled}
            onChange={(e) => onChange({ ...condition, key: e.target.value })}
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
          >
            <option value="">control…</option>
            {controlKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={condition.operator}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...condition, operator: e.target.value as AuthoredRuleConditionOperator })
            }
            className="rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
          >
            <option value="equals">equals</option>
            <option value="at_most">at most</option>
            <option value="at_least">at least</option>
          </select>
          <input
            type="text"
            value={String(condition.comparedTo)}
            disabled={disabled}
            onChange={(e) => onChange({ ...condition, comparedTo: coerce(e.target.value) })}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-foreground/40 disabled:opacity-60"
          />
        </>
      )}

      {!disabled && (
        <button type="button" onClick={onRemove} className="font-mono text-[10px] text-muted hover:text-[#dc2626]">
          ×
        </button>
      )}
    </div>
  );
}
