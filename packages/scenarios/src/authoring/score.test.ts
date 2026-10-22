import type { ScoringInputs } from "@incidentrank/simulator";
import { describe, expect, it } from "vitest";
import { scoreAuthoredAttempt } from "./score";
import { buildValidAuthoredScenario } from "./fixtures";

function baseInputs(overrides: Partial<ScoringInputs> = {}): ScoringInputs {
  return {
    incidentStartedAtMs: 30_000,
    resolvedAtMs: 90_000,
    failedAtMs: null,
    totalTimeInCriticalMs: 10_000,
    totalTimeInDegradedMs: 0,
    revenueLossUsd: 5_000,
    peakSeverityRank: 2,
    numberOfConfigurationChanges: 1,
    numberOfHarmfulChanges: 0,
    numberOfBeneficialChanges: 1,
    initialMonthlyInfrastructureCostUsd: 200,
    finalMonthlyInfrastructureCostUsd: 240,
    peakMonthlyInfrastructureCostUsd: 240,
    finalNumericValues: {},
    peakNumericValues: {},
    ...overrides,
  };
}

describe("scoreAuthoredAttempt", () => {
  it("awards the best recovery band for a fast resolution", () => {
    const scenario = buildValidAuthoredScenario();
    const result = scoreAuthoredAttempt(
      scenario.scoring,
      baseInputs({ incidentStartedAtMs: 30_000, resolvedAtMs: 80_000 }), // 50s
    );
    expect(result.breakdown.recovery).toBe(300);
  });

  it("falls back to the catch-all band for a slow resolution", () => {
    const scenario = buildValidAuthoredScenario();
    const result = scoreAuthoredAttempt(
      scenario.scoring,
      baseInputs({ incidentStartedAtMs: 0, resolvedAtMs: 600_000 }), // 600s
    );
    expect(result.breakdown.recovery).toBe(50);
  });

  it("awards zero recovery points when the attempt never resolved", () => {
    const scenario = buildValidAuthoredScenario();
    const result = scoreAuthoredAttempt(
      scenario.scoring,
      baseInputs({ resolvedAtMs: null, failedAtMs: 120_000 }),
    );
    expect(result.breakdown.recovery).toBe(50); // falls into the fallback band (Infinity measured)
  });

  it("total never exceeds 1000", () => {
    const scenario = buildValidAuthoredScenario();
    const result = scoreAuthoredAttempt(
      scenario.scoring,
      baseInputs({
        incidentStartedAtMs: 0,
        resolvedAtMs: 1_000,
        revenueLossUsd: 0,
        totalTimeInCriticalMs: 0,
        peakMonthlyInfrastructureCostUsd: 200,
        numberOfHarmfulChanges: 0,
      }),
    );
    expect(result.total).toBeLessThanOrEqual(1000);
    expect(result.total).toBe(
      Object.values(result.breakdown).reduce((sum, v) => sum + v, 0),
    );
  });

  it("is deterministic for identical inputs", () => {
    const scenario = buildValidAuthoredScenario();
    const inputs = baseInputs();
    const resultA = scoreAuthoredAttempt(scenario.scoring, inputs);
    const resultB = scoreAuthoredAttempt(scenario.scoring, inputs);
    expect(resultA).toEqual(resultB);
  });
});
