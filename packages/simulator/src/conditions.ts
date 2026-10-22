import type { ComparisonOperator, StateCondition, StateValue } from "./types";

function compare(
  actual: StateValue | boolean,
  operator: ComparisonOperator,
  expected: StateValue | boolean,
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "not_equals":
      return actual !== expected;
    case "less_than":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "less_than_or_equal":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "greater_than":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "greater_than_or_equal":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    default:
      return false;
  }
}

/**
 * Evaluates a structured, author-defined condition list (AND-combined)
 * against the current generic state values/triggers. This is the sole
 * mechanism success/failure conditions (and, via the same primitives,
 * authoring-time validation) use to inspect incident state — no code, no
 * string eval, no arbitrary expressions, per Phase 5's authoring model.
 */
export function evaluateStateConditions(
  conditions: StateCondition[],
  values: Record<string, StateValue>,
  triggers: Record<string, boolean>,
): boolean {
  for (const condition of conditions) {
    const actual =
      condition.source === "trigger"
        ? (triggers[condition.key] ?? false)
        : values[condition.key];
    if (actual === undefined) return false;
    if (!compare(actual, condition.operator, condition.comparedTo)) return false;
  }
  return true;
}
