import { describe, expect, it } from "vitest";
import type { ScoringInputs } from "@incidentrank/simulator";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { scoreAttempt } from "./scoring-helper";

const SAMPLE_INPUTS: ScoringInputs = {
  incidentStartedAtMs: 60_000,
  resolvedAtMs: 180_000,
  failedAtMs: null,
  totalTimeInCriticalMs: 20_000,
  totalTimeInDegradedMs: 40_000,
  revenueLossUsd: 5_000,
  peakSeverityRank: 2,
  numberOfConfigurationChanges: 1,
  numberOfHarmfulChanges: 0,
  numberOfBeneficialChanges: 1,
  initialMonthlyInfrastructureCostUsd: 200,
  finalMonthlyInfrastructureCostUsd: 200,
  peakMonthlyInfrastructureCostUsd: 200,
  finalNumericValues: {},
  peakNumericValues: {},
  finalStringValues: {},
};

/**
 * Task #30 (docs/implementation_plan/phase6.md's scoring-convergence
 * mandate): scoreAttempt must resolve incidentrank-owned scoring purely
 * from BUILT_IN_SCENARIO_CATALOG by slug, with zero scenario-slug
 * knowledge baked into scoreAttempt itself, and must fail loudly (throw)
 * rather than silently fall back to another scenario's bands when a
 * slug has no catalog entry.
 */
describe("scoreAttempt — built-in scenario resolution", () => {
  it("resolves Payment Retry Storm's scoring from the catalog without any DB access", async () => {
    const result = await scoreAttempt(
      {
        scenarioId: "unused-for-builtins",
        scenario: { slug: paymentRetryStorm.slug, ownershipType: "incidentrank" },
        scenarioVersion: paymentRetryStorm.version,
      },
      SAMPLE_INPUTS,
    );

    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown).toHaveProperty("recovery");
    expect(result.breakdown).toHaveProperty("customerImpact");
    expect(result.breakdown).toHaveProperty("dataIntegrity");
    expect(result.breakdown).toHaveProperty("reliability");
    expect(result.breakdown).toHaveProperty("costEfficiency");
    expect(result.breakdown).toHaveProperty("operationalEfficiency");
  });

  it("throws rather than silently falling back to another scenario's scoring for an unknown built-in slug", async () => {
    await expect(
      scoreAttempt(
        {
          scenarioId: "unused-for-builtins",
          scenario: { slug: "no-such-builtin-scenario", ownershipType: "incidentrank" },
          scenarioVersion: 1,
        },
        SAMPLE_INPUTS,
      ),
    ).rejects.toThrow(/no-such-builtin-scenario/);
  });
});
