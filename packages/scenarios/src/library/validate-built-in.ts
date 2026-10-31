import { replayAttempt, evaluateCandidateDeclaredFinish } from "@incidentrank/simulator";
import {
  SCORING_DIMENSIONS,
  validateScoringDimension,
  type AuthoredScenarioValidationError,
} from "../authoring";
import { buildIncidentNarrative } from "../narrative";
import { GOLDEN_PATHS } from "../golden-paths/registry";
import type { BuiltInScenarioEntry } from "./types";

const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const DIFFICULTY_LEVELS = new Set([
  "beginner",
  "intermediate",
  "senior",
  "staff",
  "senior_staff",
  "principal",
]);

/**
 * Phase 10G §5 — the validation contract for built-in TypeScript
 * scenarios, mirroring the structural rigor validateAuthoredScenario
 * already enforces for org-authored JSON scenarios, but adapted to the
 * built-in catalog's already-compiled shape (ScenarioSimulationDefinition,
 * not the AuthoredScenario document). Never throws; returns the list of
 * errors (empty = valid) in the same {path, message} shape as
 * validateAuthoredScenario, for UI/tooling consistency.
 *
 * Deliberately NOT a re-run of the simulation engine's own invariants
 * (the golden-path suite already proves those) — this checks the things
 * that are easy to get wrong when hand-authoring a new scenario file:
 * dangling references, missing/malformed scoring config, missing golden-
 * path registration, and missing release metadata.
 */
export function validateBuiltInScenario(
  entry: BuiltInScenarioEntry,
): AuthoredScenarioValidationError[] {
  const errors: AuthoredScenarioValidationError[] = [];

  // Checked first, and with a message that names the exact failure mode
  // from doc §9 — every other check below still runs (never short-
  // circuits), since "missing golden path" and "e.g. invalid architecture
  // reference" are independent defects an author should see together.
  if (!GOLDEN_PATHS[entry.definition.slug]) {
    errors.push({
      path: "goldenPath",
      message: `Scenario "${entry.definition.slug}" cannot be validated/published: missing golden path registration.`,
    });
  }

  validateReleaseMetadata(entry, errors);
  const nodeIds = validateArchitectureReferences(entry, errors);
  const stateKeys = new Set(Object.keys(entry.definition.simulation.initialValues));
  validateControlReferences(entry, nodeIds, errors);
  validateMetricReferences(entry, stateKeys, errors);
  validateDuplicateIds(entry, errors);
  validateScoring(entry, errors);
  validateGoldenPathReplays(entry, errors);
  validateNarrativeSmokeTest(entry, errors);

  return errors;
}

/** Thin wrapper per doc §10 — the single centralized publish gate. */
export function canPublishScenario(entry: BuiltInScenarioEntry): {
  publishable: boolean;
  errors: AuthoredScenarioValidationError[];
} {
  const errors = validateBuiltInScenario(entry);
  return { publishable: errors.length === 0, errors };
}

function validateReleaseMetadata(
  entry: BuiltInScenarioEntry,
  errors: AuthoredScenarioValidationError[],
): void {
  const { definition } = entry;
  if (!definition.structure) {
    errors.push({ path: "structure", message: "A publishable scenario must set `structure`." });
  }
  if (!definition.library?.category) {
    errors.push({
      path: "library.category",
      message: "A publishable scenario must set a library category (domain).",
    });
  }
  if (!DIFFICULTY_LEVELS.has(definition.difficulty)) {
    errors.push({
      path: "difficulty",
      message: `Unknown difficulty level "${definition.difficulty}".`,
    });
  }
}

function validateArchitectureReferences(
  entry: BuiltInScenarioEntry,
  errors: AuthoredScenarioValidationError[],
): Set<string> {
  const { architecture } = entry.definition.simulation;
  const nodeIds = new Set(architecture.nodes.map((node) => node.id));

  architecture.edges.forEach((edge, i) => {
    if (!nodeIds.has(edge.from)) {
      errors.push({
        path: `architecture.edges[${i}].from`,
        message: `Edge references unknown node "${edge.from}".`,
      });
    }
    if (!nodeIds.has(edge.to)) {
      errors.push({
        path: `architecture.edges[${i}].to`,
        message: `Edge references unknown node "${edge.to}".`,
      });
    }
  });

  return nodeIds;
}

function validateControlReferences(
  entry: BuiltInScenarioEntry,
  nodeIds: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  entry.candidateUI.controls.forEach((control, i) => {
    if (!nodeIds.has(control.componentId)) {
      errors.push({
        path: `candidateUI.controls[${i}].componentId`,
        message: `Control "${control.key}" references unknown architecture node "${control.componentId}".`,
      });
    }
  });
}

function validateMetricReferences(
  entry: BuiltInScenarioEntry,
  stateKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  entry.candidateUI.metrics.forEach((metric, i) => {
    if (!stateKeys.has(metric.sourceStateKey)) {
      errors.push({
        path: `candidateUI.metrics[${i}].sourceStateKey`,
        message: `Metric "${metric.label}" references unknown state key "${metric.sourceStateKey}".`,
      });
    }
  });
}

function validateDuplicateIds(
  entry: BuiltInScenarioEntry,
  errors: AuthoredScenarioValidationError[],
): void {
  const { simulation } = entry.definition;

  const controlKeys = new Set<string>();
  simulation.controls.forEach((control, i) => {
    if (!KEY_PATTERN.test(control.key)) {
      errors.push({ path: `controls[${i}].key`, message: `Invalid control key "${control.key}".` });
    } else if (controlKeys.has(control.key)) {
      errors.push({ path: `controls[${i}].key`, message: `Duplicate control key "${control.key}".` });
    }
    controlKeys.add(control.key);
  });

  const metricKeys = new Set<string>();
  entry.candidateUI.metrics.forEach((metric, i) => {
    if (metricKeys.has(metric.key)) {
      errors.push({ path: `candidateUI.metrics[${i}].key`, message: `Duplicate metric key "${metric.key}".` });
    }
    metricKeys.add(metric.key);
  });

  const ruleIds = new Set<string>();
  simulation.rules.forEach((rule, i) => {
    if (ruleIds.has(rule.id)) {
      errors.push({ path: `rules[${i}].id`, message: `Duplicate rule id "${rule.id}".` });
    }
    ruleIds.add(rule.id);
  });
}

function validateScoring(
  entry: BuiltInScenarioEntry,
  errors: AuthoredScenarioValidationError[],
): void {
  const { scoring } = entry;
  const dimensions = new Set<string>();

  scoring.dimensions.forEach((config, i) => {
    if (dimensions.has(config.dimension)) {
      errors.push({
        path: `scoring.dimensions[${i}].dimension`,
        message: `Duplicate scoring dimension "${config.dimension}".`,
      });
    }
    dimensions.add(config.dimension);
    validateScoringDimension(config, `scoring.dimensions[${i}]`, errors);
  });

  for (const requiredDimension of SCORING_DIMENSIONS) {
    if (!dimensions.has(requiredDimension)) {
      errors.push({
        path: "scoring.dimensions",
        message: `Missing required scoring dimension "${requiredDimension}".`,
      });
    }
  }

  const totalMax = scoring.dimensions.reduce((sum, d) => sum + d.maxPoints, 0);
  if (scoring.dimensions.length === SCORING_DIMENSIONS.size && totalMax !== 1000) {
    errors.push({ path: "scoring.dimensions", message: `Scoring weights must total 1000, got ${totalMax}.` });
  }
}

/**
 * Reuses the exact golden-path registry/replay machinery
 * catalog.golden.test.ts exercises, callable standalone (doc §5's
 * requirement) rather than only inside that test file — proves the
 * registered golden path actually resolves at its declared tier through
 * the real engine, not just that a registry entry merely exists.
 */
function validateGoldenPathReplays(
  entry: BuiltInScenarioEntry,
  errors: AuthoredScenarioValidationError[],
): void {
  const goldenPath = GOLDEN_PATHS[entry.definition.slug];
  if (!goldenPath) return; // already reported above

  const { state } = replayAttempt({
    scenario: entry.definition.simulation,
    elapsedMs: goldenPath.finishAtMs,
    actionGroups: goldenPath.actions.map((action) => ({
      elapsedMs: action.atMs,
      changes: [{ controlKey: action.controlKey, value: action.value }],
    })),
  });

  if (state.status === "resolved") {
    errors.push({
      path: "goldenPath",
      message: "The engine auto-resolved the golden path before Finish was called (Phase 7.1 violation).",
    });
    return;
  }

  const finish = evaluateCandidateDeclaredFinish(entry.definition.simulation, state);
  if (finish.outcome !== goldenPath.expectedOutcome) {
    errors.push({
      path: "goldenPath",
      message: `Golden path resolved to outcome "${finish.outcome}", expected "${goldenPath.expectedOutcome}".`,
    });
  }
  if (finish.completionTier !== goldenPath.expectedCompletionTier) {
    errors.push({
      path: "goldenPath",
      message: `Golden path resolved to completion tier "${finish.completionTier}", expected "${goldenPath.expectedCompletionTier}".`,
    });
  }
}

/**
 * Smoke-tests buildIncidentNarrative against the scenario's own
 * candidateUI + initialValues (doc §5's "narrative generation doesn't
 * throw for a representative final state" requirement) — this is the
 * one most likely to regress silently, since narrative.ts only ever
 * runs post-incident, never during an active attempt or any existing
 * golden-path assertion.
 */
function validateNarrativeSmokeTest(
  entry: BuiltInScenarioEntry,
  errors: AuthoredScenarioValidationError[],
): void {
  try {
    buildIncidentNarrative(entry.candidateUI, entry.definition.simulation.initialValues);
  } catch (error) {
    errors.push({
      path: "narrative",
      message: `buildIncidentNarrative threw for this scenario's initial state: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
  }
}
