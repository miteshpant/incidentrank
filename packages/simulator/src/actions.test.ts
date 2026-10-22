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
    controlKey: "retries",
    valueAtMost: 1,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "beneficial",
  },
  {
    controlKey: "retries",
    valueAtLeast: 5,
    whenTriggerEquals: { providerDegraded: true },
    outcome: "harmful",
  },
];

describe("classifyAction", () => {
  it("classifies a beneficial action from authored metadata", () => {
    expect(
      classifyAction(classifications, "retries", 1, { providerDegraded: true }),
    ).toBe("beneficial");
  });

  it("classifies a harmful action from authored metadata", () => {
    expect(
      classifyAction(classifications, "retries", 5, { providerDegraded: true }),
    ).toBe("harmful");
  });

  it("defaults to neutral when no classification matches", () => {
    expect(
      classifyAction(classifications, "retries", 3, { providerDegraded: true }),
    ).toBe("neutral");
  });

  it("does not match a classification authored for a different trigger state", () => {
    expect(
      classifyAction(classifications, "retries", 1, { providerDegraded: false }),
    ).toBe("neutral");
  });
});
