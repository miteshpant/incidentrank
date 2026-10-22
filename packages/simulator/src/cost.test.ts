import { describe, expect, it } from "vitest";
import { computeMonthlyCost } from "./cost";
import type { InfrastructureCostConfig } from "./types";

const costConfig: InfrastructureCostConfig = {
  baselineMonthlyUsd: 20_000,
  perUnitMonthlyUsd: {
    "paymentInstances:24": 3_000,
    "dbMaxConnections:1000": 1_700,
  },
};

describe("computeMonthlyCost", () => {
  it("returns the baseline when no priced control values are set", () => {
    const cost = computeMonthlyCost(costConfig, { paymentInstances: 8 });
    expect(cost).toBe(20_000);
  });

  it("adds authored increments for matching control values", () => {
    const cost = computeMonthlyCost(costConfig, {
      paymentInstances: 24,
      dbMaxConnections: 1000,
    });
    expect(cost).toBe(20_000 + 3_000 + 1_700);
  });

  it("never returns a negative cost", () => {
    const cost = computeMonthlyCost(
      { baselineMonthlyUsd: -5, perUnitMonthlyUsd: {} },
      {},
    );
    expect(cost).toBe(0);
  });
});
