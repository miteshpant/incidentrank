import type {
  ActionClassificationRule,
  ActionOutcome,
  ControlDefinition,
  ControlValue,
} from "./types";

export function isValidControlValue(
  controls: ControlDefinition[],
  controlKey: string,
  value: ControlValue,
): boolean {
  const control = controls.find((c) => c.key === controlKey);
  if (!control) return false;
  return control.allowedValues.includes(value);
}

/**
 * Classifies an accepted action as beneficial/neutral/harmful using
 * authored scenario metadata. Never inferred from a performance model.
 */
export function classifyAction(
  classifications: ActionClassificationRule[],
  controlKey: string,
  value: ControlValue,
  triggers: Record<string, boolean>,
): ActionOutcome {
  for (const rule of classifications) {
    if (rule.controlKey !== controlKey) continue;

    if (rule.whenTriggerEquals) {
      let triggersMatch = true;
      for (const [key, expected] of Object.entries(rule.whenTriggerEquals)) {
        if ((triggers[key] ?? false) !== expected) {
          triggersMatch = false;
          break;
        }
      }
      if (!triggersMatch) continue;
    }

    if (rule.valueEquals !== undefined && value !== rule.valueEquals) {
      continue;
    }
    if (
      rule.valueAtMost !== undefined &&
      (typeof value !== "number" || value > rule.valueAtMost)
    ) {
      continue;
    }
    if (
      rule.valueAtLeast !== undefined &&
      (typeof value !== "number" || value < rule.valueAtLeast)
    ) {
      continue;
    }

    return rule.outcome;
  }

  return "neutral";
}
