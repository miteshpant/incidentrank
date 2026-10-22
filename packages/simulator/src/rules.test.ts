import { describe, expect, it } from "vitest";
import { matchRule } from "./rules";
import type { Rule } from "./types";

const baseValues = {
  checkoutSuccessRate: 100,
  checkoutP99LatencyMs: 400,
  paymentProviderLatencyMs: 180,
  paymentTraffic: "normal" as const,
  dbPressure: "normal" as const,
  kafkaLagMessages: 0,
};

const rules: Rule[] = [
  {
    id: "degraded-low-retries",
    when: { triggerEquals: { providerDegraded: true }, controlAtMost: { retries: 1 } },
    incidentState: "storm-reduced",
    values: { ...baseValues, checkoutSuccessRate: 84 },
    componentHealth: {},
  },
  {
    id: "degraded-default",
    when: { triggerEquals: { providerDegraded: true } },
    incidentState: "storm-critical",
    values: { ...baseValues, checkoutSuccessRate: 72 },
    componentHealth: {},
  },
];

describe("matchRule", () => {
  it("returns the first matching rule in authored order", () => {
    const matched = matchRule(rules, { providerDegraded: true }, { retries: 1 });
    expect(matched?.id).toBe("degraded-low-retries");
  });

  it("falls back to a less specific rule when a more specific one does not match", () => {
    const matched = matchRule(rules, { providerDegraded: true }, { retries: 3 });
    expect(matched?.id).toBe("degraded-default");
  });

  it("returns null when the trigger is unset and no rule matches", () => {
    const matched = matchRule(rules, { providerDegraded: false }, { retries: 3 });
    expect(matched).toBeNull();
  });
});
