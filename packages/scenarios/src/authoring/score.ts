import type { ScoringInputs } from "@incidentrank/simulator";
import type {
  AuthoredNaturalRecoveryCondition,
  AuthoredScoringBand,
  AuthoredScoringConfig,
  AuthoredScoringDimension,
  AuthoredScoringDimensionConfig,
  AuthoredScoringMeasure,
  AuthoredScoringPenalty,
} from "./schema";

export interface AuthoredScoreResult {
  total: number;
  breakdown: Record<AuthoredScoringDimension, number>;
  /**
   * Phase 10G: each dimension's authored maxPoints ceiling, passed
   * through so the client never needs its own hardcoded copy of these
   * values (the Phase 10F "150 / 50" bug — a client-side constant
   * silently diverging from what a scenario actually authored). Every
   * scenario in the catalog currently uses the same fixed per-dimension
   * split (see validateAuthoredScenario's SCORE_MAX_BY_DIMENSION), but
   * this is still derived from the real config rather than re-asserting
   * that invariant here — this function has no opinion on what values
   * are "standard."
   */
  maxPoints: Record<AuthoredScoringDimension, number>;
}

/** The implicit measure each fixed dimension used before `measure` existed — preserved exactly for any dimension config that omits it. */
const DEFAULT_MEASURE_BY_DIMENSION: Record<AuthoredScoringDimension, AuthoredScoringMeasure> = {
  recovery: "recoveryTimeSeconds",
  customerImpact: "revenueLossUsd",
  dataIntegrity: "dataIntegrity",
  reliability: "criticalTimeRatio",
  costEfficiency: "costIncreaseRatio",
  operationalEfficiency: "harmfulChangeCount",
};

/**
 * Evaluates an authored scoring configuration (Phase 5 spec's Option B,
 * extended in Phase 6 to also express Payment Retry Storm's previously
 * bespoke scorer declaratively — see packages/scoring/src/
 * payment-retry-storm.ts and docs/implementation_plan/phase6.md) against
 * a completed attempt's raw ScoringInputs.
 *
 * Every dimension's measured value is derived the same deterministic way
 * regardless of which scenario authored it (see measureDimension), so
 * bands/penalties always compare like against like. A dimension scores
 * via exactly one mode: `naturalRecoveryOverride` (checked first, if the
 * config's naturalRecoveryCondition holds), then `bands` or `penalties`
 * (mutually exclusive, validated at authoring time). Never arbitrary code
 * — every mode is structured data matched/applied deterministically.
 */
export function scoreAuthoredAttempt(
  config: AuthoredScoringConfig,
  inputs: ScoringInputs,
): AuthoredScoreResult {
  const breakdown = {} as Record<AuthoredScoringDimension, number>;
  const maxPoints = {} as Record<AuthoredScoringDimension, number>;
  const isNaturalRecovery = config.naturalRecoveryCondition
    ? matchesNaturalRecovery(config.naturalRecoveryCondition, inputs)
    : false;

  for (const dimensionConfig of config.dimensions) {
    breakdown[dimensionConfig.dimension] = scoreDimension(
      dimensionConfig,
      inputs,
      isNaturalRecovery,
    );
    maxPoints[dimensionConfig.dimension] = dimensionConfig.maxPoints;
  }

  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { total: clamp(total, 0, 1000), breakdown, maxPoints };
}

function scoreDimension(
  dimensionConfig: AuthoredScoringDimensionConfig,
  inputs: ScoringInputs,
  isNaturalRecovery: boolean,
): number {
  const terminalPoints = resolveTerminalOverride(dimensionConfig, inputs);
  if (terminalPoints !== undefined) {
    return clamp(terminalPoints, 0, dimensionConfig.maxPoints);
  }

  if (isNaturalRecovery && dimensionConfig.naturalRecoveryOverride) {
    return clamp(dimensionConfig.naturalRecoveryOverride.points, 0, dimensionConfig.maxPoints);
  }

  const measure =
    dimensionConfig.measure ?? DEFAULT_MEASURE_BY_DIMENSION[dimensionConfig.dimension];
  const measured = measureDimension(measure, inputs);

  if (dimensionConfig.penalties) {
    return applyPenalties(dimensionConfig.penalties, inputs, dimensionConfig.maxPoints);
  }
  return applyBands(measured, dimensionConfig.bands ?? [], dimensionConfig.maxPoints);
}

function resolveTerminalOverride(
  dimensionConfig: AuthoredScoringDimensionConfig,
  inputs: ScoringInputs,
): number | undefined {
  const overrides = dimensionConfig.terminalOverrides;
  if (!overrides) return undefined;

  if (inputs.failedAtMs !== null) return overrides.failed;
  if (inputs.resolvedAtMs === null) return overrides.unresolved;
  return undefined;
}

function matchesNaturalRecovery(
  condition: AuthoredNaturalRecoveryCondition,
  inputs: ScoringInputs,
): boolean {
  if (inputs.resolvedAtMs === null || inputs.incidentStartedAtMs === null) return false;
  const recoveryTimeMs = inputs.resolvedAtMs - inputs.incidentStartedAtMs;
  return (
    inputs.numberOfBeneficialChanges <= condition.maxBeneficialChanges &&
    recoveryTimeMs / 1_000 >= condition.minRecoveryTimeSeconds
  );
}

function measureDimension(measure: AuthoredScoringMeasure, inputs: ScoringInputs): number {
  if (typeof measure === "object") {
    // Generic string-state comparison (Phase 6.1): compares
    // inputs.finalStringValues[measure.field] against measure.value. A
    // missing field is never === value, so it can only ever satisfy
    // "finalStringNotEquals" — an authoring typo in `field` fails
    // predictably (the equals band it was meant to hit silently never
    // matches) rather than throwing.
    const actual = inputs.finalStringValues[measure.field];
    const matches = actual === measure.value;
    return measure.type === "finalStringEquals" ? (matches ? 1 : 0) : matches ? 0 : 1;
  }

  switch (measure) {
    case "recoveryTimeSeconds": {
      if (inputs.resolvedAtMs === null || inputs.incidentStartedAtMs === null) {
        return Number.POSITIVE_INFINITY;
      }
      return (inputs.resolvedAtMs - inputs.incidentStartedAtMs) / 1_000;
    }
    case "revenueLossUsd":
      return inputs.revenueLossUsd;
    case "dataIntegrity":
      return 0;
    case "criticalTimeRatio": {
      if (inputs.resolvedAtMs === null || inputs.incidentStartedAtMs === null) {
        return Number.POSITIVE_INFINITY;
      }
      const totalMs = inputs.resolvedAtMs - inputs.incidentStartedAtMs;
      return totalMs > 0 ? inputs.totalTimeInCriticalMs / totalMs : 0;
    }
    case "costIncreaseRatio": {
      const baseline = inputs.initialMonthlyInfrastructureCostUsd;
      if (baseline <= 0) return 0;
      return (inputs.peakMonthlyInfrastructureCostUsd - baseline) / baseline;
    }
    case "harmfulChangeCount":
      return inputs.numberOfHarmfulChanges;
    case "configurationChangeCount":
      return inputs.numberOfConfigurationChanges;
  }
}

function applyBands(measured: number, bands: AuthoredScoringBand[], maxPoints: number): number {
  for (const band of bands) {
    if (band.atMost === undefined || measured <= band.atMost) {
      return clamp(band.points, 0, maxPoints);
    }
  }
  // Validation guarantees a fallback band exists for a `bands`-mode
  // dimension that passed validateAuthoredScenario.
  return 0;
}

function applyPenalties(
  penalties: AuthoredScoringPenalty[],
  inputs: ScoringInputs,
  maxPoints: number,
): number {
  // Within the same measure, only the highest-threshold matching penalty
  // applies (a tier, not a stack) — e.g. harmfulChangeCount >= 2 and
  // >= 1 are two tiers of the same penalty, not two independent
  // deductions. Across different measures, matching penalties stack
  // additively. This mirrors Payment Retry Storm's existing
  // scoreOperationalEfficiency exactly (if/else-if per measure, summed
  // across measures).
  const tightestByMeasure = new Map<string, AuthoredScoringPenalty>();
  for (const penalty of penalties) {
    const measured = measureDimension(penalty.measure, inputs);
    if (measured < penalty.atLeast) continue;
    const measureKey = measureIdentity(penalty.measure);
    const current = tightestByMeasure.get(measureKey);
    if (!current || penalty.atLeast > current.atLeast) {
      tightestByMeasure.set(measureKey, penalty);
    }
  }

  let score = maxPoints;
  for (const penalty of tightestByMeasure.values()) {
    score -= penalty.subtractPoints;
  }
  return clamp(Math.max(0, score), 0, maxPoints);
}

/** A stable string key for an AuthoredScoringMeasure, since the string-state variant is an object and can't be used as a Map key by reference equality. */
function measureIdentity(measure: AuthoredScoringMeasure): string {
  return typeof measure === "object" ? `${measure.type}:${measure.field}:${measure.value}` : measure;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
