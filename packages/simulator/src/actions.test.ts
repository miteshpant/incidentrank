import { describe, expect, it } from "vitest";
import { classifyAction, isValidControlValue } from "./actions";
import type { ActionClassificationRule, ControlDefinition } from "./types";

const controls: ControlDefinition[] = [
  { key: "retries", allowedValues: [0, 1, 3, 5], initialValue: 3 },
  {
    key: "backoff",
    allowedValues: ["none", "fixed", "exponential"],
    initialValue: "none",
  },
];

describe("isValidControlValue", () => {
  it("accepts an allowed value", () => {
    expect(isValidControlValue(controls, "retries", 1)).toBe(true);
  });

  it("rejects a value not in the allowed list", () => {
    expect(isValidControlValue(controls, "retries", 4)).toBe(false);
  });

  it("rejects an unknown control key", () => {
    expect(isValidControlValue(controls, "unknown", 1)).toBe(false);
  });
});

const classifications: ActionClassificationRule[] = [
  {
    id: "retries-low-beneficial",
    controlKey: "retries",
    valueAtMost: 1,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
    feedback: {
      title: "Reduced retry amplification",
      explanation: "Lowering retries reduced pressure on the degraded provider.",
    },
  },
  {
    // No authored id — must fall back to its array index (1).
    controlKey: "retries",
    valueAtLeast: 5,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
  },
];

describe("classifyAction", () => {
  it("classifies a beneficial action from authored metadata, returning the matched rule's id", () => {
    expect(
      classifyAction(classifications, "retries", 1, { providerDegraded: true }),
    ).toEqual({ outcome: "beneficial", matchedRuleId: "retries-low-beneficial" });
  });

  it("classifies a harmful action from authored metadata, falling back to array index when the rule has no id", () => {
    expect(
      classifyAction(classifications, "retries", 5, { providerDegraded: true }),
    ).toEqual({ outcome: "harmful", matchedRuleId: "1" });
  });

  it("defaults to neutral with a null matchedRuleId when no classification matches", () => {
    expect(
      classifyAction(classifications, "retries", 3, { providerDegraded: true }),
    ).toEqual({ outcome: "neutral", matchedRuleId: null });
  });

  it("does not match a classification authored for a different trigger state", () => {
    expect(
      classifyAction(classifications, "retries", 1, { providerDegraded: false }),
    ).toEqual({ outcome: "neutral", matchedRuleId: null });
  });
});
