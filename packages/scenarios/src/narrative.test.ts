import { describe, expect, it } from "vitest";
import { buildIncidentNarrative, hasIncidentNarrative } from "./narrative";
import type { CandidateUIDescriptor } from "./candidate-ui";

const descriptor: CandidateUIDescriptor = {
  metrics: [
    { key: "redisConnUtil", label: "Redis Connection Utilization", sourceStateKey: "redisConnUtil", format: "percentage", roleInIncident: "root_cause" },
    { key: "paymentRetries", label: "Payment Retries", sourceStateKey: "paymentRetries", format: "number", roleInIncident: "downstream_symptom" },
    { key: "inventoryLatency", label: "Inventory p95 Latency", sourceStateKey: "inventoryLatency", format: "duration", roleInIncident: "downstream_symptom" },
    { key: "checkoutStatus", label: "Checkout Health", sourceStateKey: "checkoutStatus", format: "status", roleInIncident: "context" },
    { key: "redisMemory", label: "Redis Memory", sourceStateKey: "redisMemory", format: "percentage", roleInIncident: "contributing_factor" },
    { key: "unrelatedWarning", label: "Unrelated Warning", sourceStateKey: "unrelatedWarning", format: "status", roleInIncident: "noise" },
    { key: "deployVersion", label: "Deploy Version", sourceStateKey: "deployVersion", format: "status" },
  ],
  controls: [],
  components: [],
};

const values = {
  redisConnUtil: 98,
  paymentRetries: 340,
  inventoryLatency: 1.8,
  checkoutStatus: "healthy",
  redisMemory: 42,
  unrelatedWarning: "flaky-sensor",
  deployVersion: "v1.2.3",
};

describe("buildIncidentNarrative", () => {
  it("groups metrics by roleInIncident and reads each metric's live value", () => {
    const narrative = buildIncidentNarrative(descriptor, values);

    expect(narrative.rootCause).toEqual([
      { label: "Redis Connection Utilization", value: 98 },
    ]);
    expect(narrative.contributingFactors).toEqual([
      { label: "Redis Memory", value: 42 },
    ]);
    expect(narrative.observedEffects).toEqual([
      { label: "Payment Retries", value: 340 },
      { label: "Inventory p95 Latency", value: 1.8 },
    ]);
    expect(narrative.context).toEqual([
      { label: "Checkout Health", value: "healthy" },
    ]);
  });

  it("never surfaces noise-tagged metrics in any narrative group", () => {
    const narrative = buildIncidentNarrative(descriptor, values);
    const all = [
      ...narrative.rootCause,
      ...narrative.contributingFactors,
      ...narrative.observedEffects,
      ...narrative.context,
    ];
    expect(all.some((entry) => entry.label === "Unrelated Warning")).toBe(false);
  });

  it("excludes metrics with no roleInIncident tag at all", () => {
    const narrative = buildIncidentNarrative(descriptor, values);
    const all = [
      ...narrative.rootCause,
      ...narrative.contributingFactors,
      ...narrative.observedEffects,
      ...narrative.context,
    ];
    expect(all.some((entry) => entry.label === "Deploy Version")).toBe(false);
  });

  it("returns all-empty groups for a scenario with no roleInIncident tags anywhere (every pre-Phase-10F scenario)", () => {
    const untaggedDescriptor: CandidateUIDescriptor = {
      metrics: [
        { key: "errorRate", label: "Error Rate", sourceStateKey: "errorRate", format: "percentage" },
      ],
      controls: [],
      components: [],
    };
    const narrative = buildIncidentNarrative(untaggedDescriptor, { errorRate: 5 });

    expect(narrative.rootCause).toEqual([]);
    expect(narrative.contributingFactors).toEqual([]);
    expect(narrative.observedEffects).toEqual([]);
    expect(narrative.context).toEqual([]);
    expect(hasIncidentNarrative(narrative)).toBe(false);
  });

  it("hasIncidentNarrative is true when any group has an entry", () => {
    const narrative = buildIncidentNarrative(descriptor, values);
    expect(hasIncidentNarrative(narrative)).toBe(true);
  });
});
