import { describe, expect, it } from "vitest";
import { validateAuthoredScenario } from "./validate";
import { buildValidAuthoredScenario } from "./fixtures";

describe("validateAuthoredScenario — valid scenario", () => {
  it("returns no errors for a fully valid authored scenario", () => {
    const errors = validateAuthoredScenario(buildValidAuthoredScenario());
    expect(errors).toEqual([]);
  });
});

describe("validateAuthoredScenario — control validation", () => {
  it("rejects a control whose initial value is not among allowed values", () => {
    const authored = buildValidAuthoredScenario({
      controls: [
        {
          key: "retries",
          label: "Retries",
          type: "select",
          allowedValues: [0, 1, 3, 5],
          initialValue: 9,
          componentId: "api",
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "controls[0].initialValue")).toBe(true);
  });

  it("rejects a toggle control without exactly [false, true] allowed values", () => {
    const authored = buildValidAuthoredScenario({
      controls: [
        {
          key: "flag",
          label: "Flag",
          type: "toggle",
          allowedValues: [true],
          initialValue: true,
          componentId: "api",
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "controls[0].allowedValues")).toBe(true);
  });

  it("rejects duplicate control keys", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      controls: [base.controls[0]!, { ...base.controls[0]! }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "controls[1].key")).toBe(true);
  });
});

describe("validateAuthoredScenario — rule validation", () => {
  it("rejects a rule that references an unknown control", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      rules: [
        ...base.rules,
        {
          id: "bad-rule",
          when: [{ source: "control", key: "retryCount", operator: "equals", comparedTo: 1 }],
          incidentState: "bad",
          setValues: { connectionUsage: 10 },
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some(
        (e) => e.path === "rules[3].when[0].key" && e.message.includes("retryCount"),
      ),
    ).toBe(true);
  });

  it("rejects a rule that sets an unknown state key", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      rules: [
        {
          ...base.rules[0]!,
          setValues: { ...base.rules[0]!.setValues, p99: 100 },
        },
        ...base.rules.slice(1),
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "rules[0].setValues.p99")).toBe(true);
  });

  it("requires a default/fallback rule (empty `when`)", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      rules: base.rules.filter((r) => r.when.length > 0),
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "rules")).toBe(true);
  });

  it("rejects a rule referencing a trigger no timeline event ever sets", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      rules: [
        {
          ...base.rules[0]!,
          when: [{ source: "trigger", key: "neverSet", equals: true }],
        },
        ...base.rules.slice(1),
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "rules[0].when[0].key")).toBe(true);
  });
});

describe("validateAuthoredScenario — operator validation", () => {
  it("rejects an unsupported success-condition operator", () => {
    const authored = buildValidAuthoredScenario({
      successCondition: {
        conditions: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { key: "connectionUsage", operator: "matches" as any, comparedTo: 1 },
        ],
        sustainedSeconds: 10,
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "successCondition.conditions[0].operator")).toBe(true);
  });

  it("rejects at_most with a non-numeric comparedTo", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      rules: [
        {
          ...base.rules[0]!,
          when: [
            { source: "control", key: "poolSize", operator: "at_most", comparedTo: "oops" },
          ],
        },
        ...base.rules.slice(1),
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "rules[0].when[0].comparedTo")).toBe(true);
  });
});

describe("validateAuthoredScenario — timed-event validation", () => {
  it("rejects a timeline event with a negative time", () => {
    const authored = buildValidAuthoredScenario({
      timelineEvents: [
        { id: "bad", atSeconds: -5, label: "Bad", message: "Bad event" },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "timelineEvents[0].atSeconds")).toBe(true);
  });
});

describe("validateAuthoredScenario — success/failure validation", () => {
  it("rejects a success condition referencing an unknown state key", () => {
    const authored = buildValidAuthoredScenario({
      successCondition: {
        conditions: [{ key: "unknownKey", operator: "less_than", comparedTo: 1 }],
        sustainedSeconds: 10,
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "successCondition.conditions[0].key")).toBe(true);
  });
});

describe("validateAuthoredScenario — severity field validation", () => {
  it("accepts a severity field referencing a known state key with valid rule values", () => {
    const authored = buildValidAuthoredScenario({
      severityFields: [{ key: "dbStatus" }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors).toEqual([]);
  });

  it("rejects a severity field referencing an unknown state key", () => {
    const authored = buildValidAuthoredScenario({
      severityFields: [{ key: "unknownField" }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "severityFields[0].key")).toBe(true);
  });

  it("rejects a duplicate severity field key", () => {
    const authored = buildValidAuthoredScenario({
      severityFields: [{ key: "dbStatus" }, { key: "dbStatus" }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "severityFields[1].key")).toBe(true);
  });

  it("rejects a rule that sets a severity field to a value outside normal/warning/critical", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      severityFields: [{ key: "dbStatus" }],
      rules: [
        { ...base.rules[0]!, setValues: { ...base.rules[0]!.setValues, dbStatus: "severe" } },
        ...base.rules.slice(1),
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "rules[0].setValues.dbStatus")).toBe(true);
  });

  it("rejects an announceCritical config with an unknown event type", () => {
    const authored = buildValidAuthoredScenario({
      severityFields: [
        {
          key: "dbStatus",
          announceCritical: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            enteringType: "NOT_A_REAL_EVENT" as any,
            enteringMessage: "x",
            recoveringType: "SEVERITY_RECOVERED",
            recoveringMessage: "y",
          },
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "severityFields[0].announceCritical.enteringType")).toBe(
      true,
    );
  });
});

describe("validateAuthoredScenario — numeric watch field validation", () => {
  it("accepts a numeric watch field referencing a numeric state key", () => {
    const authored = buildValidAuthoredScenario({
      numericWatchFields: [{ key: "connectionUsage", trackPeak: true }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors).toEqual([]);
  });

  it("rejects a numeric watch field referencing a non-numeric state key", () => {
    const authored = buildValidAuthoredScenario({
      numericWatchFields: [{ key: "dbStatus", trackPeak: true }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "numericWatchFields[0].key")).toBe(true);
  });

  it("rejects a numeric watch field threshold with a missing message", () => {
    const authored = buildValidAuthoredScenario({
      numericWatchFields: [
        {
          key: "connectionUsage",
          trackPeak: true,
          threshold: {
            value: 90,
            enteringType: "THRESHOLD_CROSSED",
            enteringMessage: "",
            recoveringType: "THRESHOLD_RECOVERED",
            recoveringMessage: "recovered",
          },
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some((e) => e.path === "numericWatchFields[0].threshold.enteringMessage"),
    ).toBe(true);
  });
});

describe("validateAuthoredScenario — impact validation", () => {
  it("accepts revenue loss keyed by a declared incident state and valid cost config", () => {
    const authored = buildValidAuthoredScenario({
      impact: {
        revenueLossRatePerMinute: { saturated: 500 },
        infrastructureCost: {
          baselineMonthlyUsd: 1_000,
          perUnitMonthlyUsd: { "poolSize:200": 300 },
        },
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors).toEqual([]);
  });

  it("rejects revenue loss keyed by an incident state no rule ever sets", () => {
    const authored = buildValidAuthoredScenario({
      impact: { revenueLossRatePerMinute: { "never-set-state": 100 } },
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some((e) => e.path === "impact.revenueLossRatePerMinute.never-set-state"),
    ).toBe(true);
  });

  it("rejects a negative baseline monthly cost", () => {
    const authored = buildValidAuthoredScenario({
      impact: { infrastructureCost: { baselineMonthlyUsd: -1, perUnitMonthlyUsd: {} } },
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some((e) => e.path === "impact.infrastructureCost.baselineMonthlyUsd"),
    ).toBe(true);
  });

  it("rejects a perUnitMonthlyUsd key whose controlKey is not declared", () => {
    const authored = buildValidAuthoredScenario({
      impact: {
        infrastructureCost: {
          baselineMonthlyUsd: 0,
          perUnitMonthlyUsd: { "unknownControl:5": 10 },
        },
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some(
        (e) => e.path === "impact.infrastructureCost.perUnitMonthlyUsd.unknownControl:5",
      ),
    ).toBe(true);
  });
});

describe("validateAuthoredScenario — action classification validation", () => {
  it("accepts a classification with exactly one matcher and a known control/trigger", () => {
    const authored = buildValidAuthoredScenario({
      actionClassifications: [
        {
          controlKey: "poolSize",
          valueAtLeast: 100,
          whenTriggerEquals: { saturating: true },
          outcome: "beneficial",
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors).toEqual([]);
  });

  it("rejects a classification referencing an unknown control", () => {
    const authored = buildValidAuthoredScenario({
      actionClassifications: [
        { controlKey: "unknownControl", valueAtLeast: 1, outcome: "beneficial" },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "actionClassifications[0].controlKey")).toBe(true);
  });

  it("rejects a classification with zero matchers", () => {
    const authored = buildValidAuthoredScenario({
      actionClassifications: [{ controlKey: "poolSize", outcome: "beneficial" }],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "actionClassifications[0]")).toBe(true);
  });

  it("rejects a classification with more than one matcher", () => {
    const authored = buildValidAuthoredScenario({
      actionClassifications: [
        { controlKey: "poolSize", valueAtLeast: 100, valueAtMost: 50, outcome: "beneficial" },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "actionClassifications[0]")).toBe(true);
  });

  it("rejects a classification referencing a trigger no timeline event ever sets", () => {
    const authored = buildValidAuthoredScenario({
      actionClassifications: [
        {
          controlKey: "poolSize",
          valueAtLeast: 100,
          whenTriggerEquals: { neverSet: true },
          outcome: "beneficial",
        },
      ],
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some((e) => e.path === "actionClassifications[0].whenTriggerEquals.neverSet"),
    ).toBe(true);
  });
});

describe("validateAuthoredScenario — scoring validation", () => {
  it("rejects scoring weights that do not total 1000", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      scoring: {
        dimensions: base.scoring.dimensions.map((d) =>
          d.dimension === "recovery" ? { ...d, maxPoints: 299 } : d,
        ),
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some((e) => e.path === "scoring.dimensions[0].maxPoints"),
    ).toBe(true);
  });

  it("rejects a missing required scoring dimension", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      scoring: {
        dimensions: base.scoring.dimensions.filter((d) => d.dimension !== "dataIntegrity"),
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(
      errors.some(
        (e) => e.path === "scoring.dimensions" && e.message.includes("dataIntegrity"),
      ),
    ).toBe(true);
  });

  it("rejects scoring bands without exactly one fallback band", () => {
    const base = buildValidAuthoredScenario();
    const authored = buildValidAuthoredScenario({
      scoring: {
        dimensions: base.scoring.dimensions.map((d) =>
          d.dimension === "recovery" ? { ...d, bands: [{ atMost: 60, points: 300 }] } : d,
        ),
      },
    });

    const errors = validateAuthoredScenario(authored);
    expect(errors.some((e) => e.path === "scoring.dimensions[0].bands")).toBe(true);
  });
});
