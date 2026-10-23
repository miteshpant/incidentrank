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

export interface ActionClassificationResult {
  outcome: ActionOutcome;
  /** Identity of the matched rule (rule.id, falling back to its array
   * index when the rule has no authored id), or null when no rule
   * matched (outcome defaulted to "neutral"). Persisted at classification
   * time — see ActionFeedback's doc comment for why this must never be
   * re-derived later by re-running classification against final state. */
  matchedRuleId: string | null;
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
): ActionClassificationResult {
  for (let index = 0; index < classifications.length; index += 1) {
    const rule = classifications[index]!;
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

    return { outcome: rule.outcome, matchedRuleId: rule.id ?? String(index) };
  }

  return { outcome: "neutral", matchedRuleId: null };
}
