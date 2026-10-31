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
    finalStringValues: {},
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

  describe("maxPoints (Phase 10G)", () => {
    // Phase 10G: the client must never own a competing hardcoded copy of
    // each dimension's maxPoints (the "150 / 50" bug) — the server-side
    // scorer is the single source of truth, and must report the exact
    // authored ceiling it actually used.
    it("reports each dimension's authored maxPoints exactly, for a standard-weight scenario", () => {
      const scenario = buildValidAuthoredScenario();
      const result = scoreAuthoredAttempt(scenario.scoring, baseInputs());

      for (const dimensionConfig of scenario.scoring.dimensions) {
        expect(result.maxPoints[dimensionConfig.dimension]).toBe(dimensionConfig.maxPoints);
      }
    });

    it("reports a non-standard maxPoints value exactly as authored, without assuming any fixed catalog-wide split", () => {
      const nonStandardConfig = {
        dimensions: [
          { dimension: "recovery" as const, maxPoints: 123, bands: [{ points: 123 }] },
          { dimension: "customerImpact" as const, maxPoints: 456, bands: [{ points: 456 }] },
        ],
      };
      const result = scoreAuthoredAttempt(nonStandardConfig, baseInputs());

      expect(result.maxPoints.recovery).toBe(123);
      expect(result.maxPoints.customerImpact).toBe(456);
    });
  });

  describe("declared_unstable scoring (Phase 6.1)", () => {
    // Phase 6.1's binding decision: a candidate-declared "Finish" while
    // the system was not in an acceptable state maps to resolvedAtMs=null
    // and failedAtMs=null at the ScoringInputs level — scored via the
    // existing terminalOverrides.unresolved bucket, with NO new
    // terminalOverrides.declaredUnstable key. This is the same mechanism
    // "ran out of time, never resolved" already used — the engine itself
    // has no notion of "declared_unstable" at all; that distinction lives
    // only in the DB's IncidentOutcome enum (apps/web), never reaching
    // the scorer. See docs/implementation_plan/outputs/
    // phase6.1-completion-report.md.
    const scoringConfigWithMixedOverrides = {
      dimensions: [
        {
          dimension: "recovery" as const,
          maxPoints: 300,
          terminalOverrides: { failed: 0, unresolved: 0 },
          bands: [{ atMost: 60, points: 300 }, { points: 50 }],
        },
        {
          dimension: "reliability" as const,
          maxPoints: 150,
          terminalOverrides: { failed: 0, unresolved: 0 },
          bands: [{ atMost: 0.3, points: 150 }, { points: 50 }],
        },
        {
          // Deliberately NO terminalOverrides — proves these dimensions
          // score identically for resolved vs. declared_unstable, per
          // phase6.1.md's "Customer Impact may still earn points" /
          // "this follows the same philosophy already used for failed
          // attempts" guidance.
          dimension: "customerImpact" as const,
          maxPoints: 200,
          bands: [{ atMost: 10_000, points: 200 }, { points: 50 }],
        },
        {
          dimension: "dataIntegrity" as const,
          maxPoints: 200,
          bands: [{ points: 200 }],
        },
        {
          dimension: "costEfficiency" as const,
          maxPoints: 100,
          bands: [{ atMost: 0.5, points: 100 }, { points: 20 }],
        },
        {
          dimension: "operationalEfficiency" as const,
          maxPoints: 50,
          bands: [{ atMost: 1, points: 50 }, { points: 10 }],
        },
      ],
    };

    it("a declared-unstable attempt (resolvedAtMs=null, failedAtMs=null) scores via terminalOverrides.unresolved, same as a never-resolved attempt", () => {
      const declaredUnstableInputs = baseInputs({
        resolvedAtMs: null,
        failedAtMs: null,
      });
      const neverResolvedInputs = baseInputs({
        resolvedAtMs: null,
        failedAtMs: null,
      });

      const declaredUnstableResult = scoreAuthoredAttempt(
        scoringConfigWithMixedOverrides,
        declaredUnstableInputs,
      );
      const neverResolvedResult = scoreAuthoredAttempt(
        scoringConfigWithMixedOverrides,
        neverResolvedInputs,
      );

      // Same ScoringInputs shape (resolvedAtMs=null, failedAtMs=null)
      // produces an identical score regardless of why the attempt ended
      // that way (a candidate-declared Finish vs. simply never
      // resolving) — the scorer has no way to distinguish them, by
      // design.
      expect(declaredUnstableResult).toEqual(neverResolvedResult);
      expect(declaredUnstableResult.breakdown.recovery).toBe(0);
      expect(declaredUnstableResult.breakdown.reliability).toBe(0);
    });

    it("resolved and declared-unstable attempts (same underlying state/actions) differ ONLY on dimensions with an unresolved terminalOverride", () => {
      // Same action quality (1 beneficial change, 0 harmful, same cost/
      // revenue/severity figures) — the only difference is whether the
      // attempt's resolvedAtMs is set (a genuine successCondition match)
      // or null (the candidate declared Finish before that happened).
      const sharedFields: Partial<ScoringInputs> = {
        incidentStartedAtMs: 30_000,
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
      };

      const resolvedResult = scoreAuthoredAttempt(
        scoringConfigWithMixedOverrides,
        baseInputs({ ...sharedFields, resolvedAtMs: 80_000 }),
      );
      const declaredUnstableResult = scoreAuthoredAttempt(
        scoringConfigWithMixedOverrides,
        baseInputs({ ...sharedFields, resolvedAtMs: null }),
      );

      // Dimensions WITH terminalOverrides.unresolved differ.
      expect(resolvedResult.breakdown.recovery).not.toBe(
        declaredUnstableResult.breakdown.recovery,
      );
      expect(resolvedResult.breakdown.reliability).not.toBe(
        declaredUnstableResult.breakdown.reliability,
      );

      // Dimensions WITHOUT terminalOverrides.unresolved are identical —
      // the candidate still earns normal credit for customer impact,
      // data integrity, cost efficiency, and operational efficiency even
      // though the attempt ended as declared_unstable.
      expect(resolvedResult.breakdown.customerImpact).toBe(
        declaredUnstableResult.breakdown.customerImpact,
      );
      expect(resolvedResult.breakdown.dataIntegrity).toBe(
        declaredUnstableResult.breakdown.dataIntegrity,
      );
      expect(resolvedResult.breakdown.costEfficiency).toBe(
        declaredUnstableResult.breakdown.costEfficiency,
      );
      expect(resolvedResult.breakdown.operationalEfficiency).toBe(
        declaredUnstableResult.breakdown.operationalEfficiency,
      );

      // declared_unstable does not imply a zero total score.
      expect(declaredUnstableResult.total).toBeGreaterThan(0);
    });
  });

  describe("generic string-state measures (Phase 6.1)", () => {
    // finalStringEquals/finalStringNotEquals let scoring reward/penalize
    // ANY scenario-authored string state field declaratively — never a
    // scenario-specific measure (e.g. no "orderingPreserved") baked into
    // the shared scorer itself. See packages/scenarios/src/
    // kafka-partition-skew/scoring.ts for a real consumer.
    const stringMeasureConfig = {
      dimensions: [
        {
          dimension: "dataIntegrity" as const,
          maxPoints: 200,
          measure: { type: "finalStringEquals" as const, field: "orderingMode", value: "degraded" },
          bands: [{ atMost: 0, points: 200 }, { points: 140 }],
        },
      ],
    };

    it("numeric scoring remains unchanged when finalStringValues is present but unused", () => {
      const scenario = buildValidAuthoredScenario();
      const result = scoreAuthoredAttempt(
        scenario.scoring,
        baseInputs({
          incidentStartedAtMs: 30_000,
          resolvedAtMs: 80_000,
          finalStringValues: { someUnrelatedField: "someValue" },
        }),
      );
      expect(result.breakdown.recovery).toBe(300);
    });

    it("scores the full band when the string field does not equal the penalized value (ordering preserved)", () => {
      const result = scoreAuthoredAttempt(
        stringMeasureConfig,
        baseInputs({ finalStringValues: { orderingMode: "preserved" } }),
      );
      expect(result.breakdown.dataIntegrity).toBe(200);
    });

    it("scores the lower band when the string field equals the penalized value (ordering degraded) — string values are no longer silently dropped", () => {
      const result = scoreAuthoredAttempt(
        stringMeasureConfig,
        baseInputs({ finalStringValues: { orderingMode: "degraded" } }),
      );
      expect(result.breakdown.dataIntegrity).toBe(140);
    });

    it("a missing/unknown field evaluates predictably as not-equal, never throws", () => {
      const result = scoreAuthoredAttempt(
        stringMeasureConfig,
        baseInputs({ finalStringValues: {} }),
      );
      // field "orderingMode" is absent entirely -> never equals "degraded"
      // -> measured value 0 -> falls into the atMost:0 band (full points),
      // the same outcome as "preserved" would produce. This is the
      // "predictable, never throws" behavior the missing-field case must
      // have — an authoring typo in `field` silently never matches
      // finalStringEquals, rather than crashing the scorer.
      expect(result.breakdown.dataIntegrity).toBe(200);
    });

    it("finalStringNotEquals is the logical complement of finalStringEquals", () => {
      // measureDimension returns 1 (not-equal / "true") or 0 (equal /
      // "false") for finalStringNotEquals — the atMost:0 band therefore
      // matches the EQUAL case, and the fallback band matches NOT-EQUAL.
      const notEqualsConfig = {
        dimensions: [
          {
            dimension: "dataIntegrity" as const,
            maxPoints: 200,
            measure: { type: "finalStringNotEquals" as const, field: "orderingMode", value: "degraded" },
            bands: [{ atMost: 0, points: 50 }, { points: 200 }],
          },
        ],
      };

      const preserved = scoreAuthoredAttempt(
        notEqualsConfig,
        baseInputs({ finalStringValues: { orderingMode: "preserved" } }),
      );
      const degraded = scoreAuthoredAttempt(
        notEqualsConfig,
        baseInputs({ finalStringValues: { orderingMode: "degraded" } }),
      );

      // "preserved" !== "degraded" -> notEquals measures 1 -> fallback band (200).
      expect(preserved.breakdown.dataIntegrity).toBe(200);
      // "degraded" === "degraded" -> notEquals measures 0 -> atMost:0 band (50).
      expect(degraded.breakdown.dataIntegrity).toBe(50);
    });
  });
});
