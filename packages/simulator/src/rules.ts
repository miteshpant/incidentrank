import type { ControlValue, Rule, RuleCondition } from "./types";

function controlConditionsMatch(
  condition: RuleCondition,
  controlValues: Record<string, ControlValue>,
): boolean {
  if (condition.controlEquals) {
    for (const [key, expected] of Object.entries(condition.controlEquals)) {
      if (controlValues[key] !== expected) return false;
    }
  }

  if (condition.controlAtMost) {
    for (const [key, max] of Object.entries(condition.controlAtMost)) {
      const actual = controlValues[key];
      if (typeof actual !== "number" || actual > max) return false;
    }
  }

  if (condition.controlAtLeast) {
    for (const [key, min] of Object.entries(condition.controlAtLeast)) {
      const actual = controlValues[key];
      if (typeof actual !== "number" || actual < min) return false;
    }
  }

  return true;
}

function triggerConditionsMatch(
  condition: RuleCondition,
  triggers: Record<string, boolean>,
): boolean {
  if (!condition.triggerEquals) return true;
  for (const [key, expected] of Object.entries(condition.triggerEquals)) {
    if ((triggers[key] ?? false) !== expected) return false;
  }
  return true;
}

/**
 * Finds the first rule (in authored order) whose condition matches the
 * current trigger flags and control values. Rules are authored
 * most-specific-first; this function applies no scoring/ranking of its own.
 */
export function matchRule(
  rules: Rule[],
  triggers: Record<string, boolean>,
  controlValues: Record<string, ControlValue>,
): Rule | null {
  for (const rule of rules) {
    if (!triggerConditionsMatch(rule.when, triggers)) continue;
    if (!controlConditionsMatch(rule.when, controlValues)) continue;
    return rule;
  }
  return null;
}
