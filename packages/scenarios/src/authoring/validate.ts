import type {
  AuthoredActionClassification,
  AuthoredControl,
  AuthoredNumericWatchField,
  AuthoredOutcomeCondition,
  AuthoredRuleCondition,
  AuthoredScenario,
  AuthoredScoringBand,
  AuthoredScoringDimensionConfig,
  AuthoredScoringMeasure,
  AuthoredScoringPenalty,
  AuthoredSeverityField,
  AuthoredStateCondition,
} from "./schema";
import type { AuthoredScenarioValidationError } from "./errors";

const STRING_STATE_MEASURE_TYPES = new Set(["finalStringEquals", "finalStringNotEquals"]);

/**
 * True when `measure` is either a known flat-string measure, or a
 * well-formed generic string-state comparison object (Phase 6.1) — a
 * non-empty `field`/`value` of the right shape. Does not check whether
 * `field` actually names a real scenario state key: a nonexistent field
 * evaluates predictably at scoring time (never-equal, see score.ts's
 * measureDimension) rather than throwing, so that's a scoring-content
 * concern, not a hard validation error.
 */
function isKnownScoringMeasure(measure: AuthoredScoringMeasure): boolean {
  if (typeof measure === "object") {
    return (
      STRING_STATE_MEASURE_TYPES.has(measure.type) &&
      typeof measure.field === "string" &&
      measure.field.length > 0 &&
      typeof measure.value === "string"
    );
  }
  return SCORING_MEASURES.has(measure);
}

function describeMeasure(measure: AuthoredScoringMeasure): string {
  return typeof measure === "object" ? JSON.stringify(measure) : measure;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;
const RULE_CONDITION_OPERATORS = new Set(["equals", "at_most", "at_least"]);
const SEVERITY_LEVELS = new Set(["normal", "warning", "critical"]);
const ACTION_OUTCOMES = new Set(["beneficial", "neutral", "harmful"]);
const SIMULATION_EVENT_TYPES = new Set([
  "INCIDENT_STARTED",
  "TRIGGER_SET",
  "STATUS_CHANGED",
  "CONFIG_CHANGED",
  "CONFIG_CHANGE_REJECTED",
  "SEVERITY_CRITICAL",
  "SEVERITY_RECOVERED",
  "THRESHOLD_CROSSED",
  "THRESHOLD_RECOVERED",
  "INCIDENT_RESOLVED",
  "INCIDENT_FAILED",
]);
const STATE_CONDITION_OPERATORS = new Set([
  "equals",
  "not_equals",
  "less_than",
  "less_than_or_equal",
  "greater_than",
  "greater_than_or_equal",
]);
const SCORING_DIMENSIONS = new Set([
  "recovery",
  "customerImpact",
  "dataIntegrity",
  "reliability",
  "costEfficiency",
  "operationalEfficiency",
]);
const SCORE_MAX_BY_DIMENSION: Record<string, number> = {
  recovery: 300,
  customerImpact: 200,
  dataIntegrity: 200,
  reliability: 150,
  costEfficiency: 100,
  operationalEfficiency: 50,
};
const SCORING_MEASURES = new Set([
  "recoveryTimeSeconds",
  "revenueLossUsd",
  "dataIntegrity",
  "criticalTimeRatio",
  "costIncreaseRatio",
  "harmfulChangeCount",
  "configurationChangeCount",
]);

/**
 * Validates a fully-formed authored scenario against structured rules.
 * Returns the list of errors (empty = valid). Never throws — callers
 * (compileAuthoredScenario, publish) decide how to react. A draft may be
 * saved with validation errors present; only publishing requires zero
 * errors, per the spec's "Drafts may be incomplete" rule.
 */
export function validateAuthoredScenario(
  authored: AuthoredScenario,
): AuthoredScenarioValidationError[] {
  const errors: AuthoredScenarioValidationError[] = [];

  validateBasics(authored, errors);
  const nodeIds = validateArchitecture(authored, errors);
  const controlKeys = validateControls(authored.controls, nodeIds, errors);
  const stateKeys = validateInitialState(authored, errors);
  validateMetrics(authored, stateKeys, errors);
  const triggerKeys = validateTimelineEvents(authored, errors);
  validateRules(authored, controlKeys, triggerKeys, stateKeys, errors);
  validateOutcomeCondition(authored.successCondition, "successCondition", stateKeys, triggerKeys, errors);
  validateOutcomeCondition(authored.failureCondition, "failureCondition", stateKeys, triggerKeys, errors);
  validateScoring(authored.scoring, errors);
  validateSeverityFields(authored, stateKeys, errors);
  validateNumericWatchFields(authored, stateKeys, errors);
  validateImpact(authored, controlKeys, errors);
  validateActionClassifications(authored, controlKeys, triggerKeys, errors);

  return errors;
}

function validateBasics(
  authored: AuthoredScenario,
  errors: AuthoredScenarioValidationError[],
): void {
  const { basics } = authored;
  if (!basics.name.trim()) {
    errors.push({ path: "basics.name", message: "Scenario name is required." });
  }
  if (!SLUG_PATTERN.test(basics.slug)) {
    errors.push({
      path: "basics.slug",
      message: "Slug must be lowercase letters, numbers, and hyphens only.",
    });
  }
  if (!basics.description.trim()) {
    errors.push({ path: "basics.description", message: "Description is required." });
  }
  if (basics.estimatedMinutes <= 0) {
    errors.push({
      path: "basics.estimatedMinutes",
      message: "Estimated duration must be greater than zero.",
    });
  }
}

function validateArchitecture(
  authored: AuthoredScenario,
  errors: AuthoredScenarioValidationError[],
): Set<string> {
  const { nodes, edges } = authored.architecture;
  if (nodes.length === 0) {
    errors.push({ path: "architecture.nodes", message: "At least one architecture node is required." });
  }
  const nodeIds = new Set<string>();
  nodes.forEach((node, i) => {
    if (!node.id.trim()) {
      errors.push({ path: `architecture.nodes[${i}].id`, message: "Node id is required." });
    } else if (nodeIds.has(node.id)) {
      errors.push({ path: `architecture.nodes[${i}].id`, message: `Duplicate node id "${node.id}".` });
    }
    nodeIds.add(node.id);
    if (!node.label.trim()) {
      errors.push({ path: `architecture.nodes[${i}].label`, message: "Node label is required." });
    }
  });
  edges.forEach((edge, i) => {
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

function validateControls(
  controls: AuthoredControl[],
  nodeIds: Set<string>,
  errors: AuthoredScenarioValidationError[],
): Set<string> {
  const keys = new Set<string>();

  controls.forEach((control, i) => {
    const path = `controls[${i}]`;
    if (!KEY_PATTERN.test(control.key)) {
      errors.push({ path: `${path}.key`, message: `Invalid control key "${control.key}".` });
    } else if (keys.has(control.key)) {
      errors.push({ path: `${path}.key`, message: `Duplicate control key "${control.key}".` });
    }
    keys.add(control.key);

    if (!control.label.trim()) {
      errors.push({ path: `${path}.label`, message: "Control label is required." });
    }

    if (!nodeIds.has(control.componentId)) {
      errors.push({
        path: `${path}.componentId`,
        message: `Control "${control.key}" references unknown architecture node "${control.componentId}".`,
      });
    }

    if (control.type === "toggle") {
      const sorted = [...control.allowedValues].sort();
      if (
        control.allowedValues.length !== 2 ||
        JSON.stringify(sorted) !== JSON.stringify([false, true])
      ) {
        errors.push({
          path: `${path}.allowedValues`,
          message: 'Toggle controls must have allowedValues exactly [false, true].',
        });
      }
    } else if (control.allowedValues.length === 0) {
      errors.push({
        path: `${path}.allowedValues`,
        message: "Control must have at least one allowed value.",
      });
    }

    if (!control.allowedValues.includes(control.initialValue)) {
      errors.push({
        path: `${path}.initialValue`,
        message: `Control "${control.key}" has no initial value among its allowed values.`,
      });
    }
  });

  return keys;
}

function validateInitialState(
  authored: AuthoredScenario,
  errors: AuthoredScenarioValidationError[],
): Set<string> {
  const keys = new Set(Object.keys(authored.initialState));
  if (keys.size === 0) {
    errors.push({ path: "initialState", message: "At least one initial state field is required." });
  }
  for (const key of keys) {
    if (!KEY_PATTERN.test(key)) {
      errors.push({ path: `initialState.${key}`, message: `Invalid state key "${key}".` });
    }
  }
  return keys;
}

function validateMetrics(
  authored: AuthoredScenario,
  stateKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  authored.metrics.forEach((metric, i) => {
    const path = `metrics[${i}]`;
    if (!metric.label.trim()) {
      errors.push({ path: `${path}.label`, message: "Metric label is required." });
    }
    if (!stateKeys.has(metric.sourceStateKey)) {
      errors.push({
        path: `${path}.sourceStateKey`,
        message: `Metric "${metric.label}" references unknown state key "${metric.sourceStateKey}".`,
      });
    }
  });
}

function validateTimelineEvents(
  authored: AuthoredScenario,
  errors: AuthoredScenarioValidationError[],
): Set<string> {
  const triggerKeys = new Set<string>();
  const ids = new Set<string>();

  authored.timelineEvents.forEach((event, i) => {
    const path = `timelineEvents[${i}]`;
    if (ids.has(event.id)) {
      errors.push({ path: `${path}.id`, message: `Duplicate timeline event id "${event.id}".` });
    }
    ids.add(event.id);

    if (event.atSeconds < 0) {
      errors.push({ path: `${path}.atSeconds`, message: "Timeline event time must be >= 0." });
    }
    if (!event.message.trim()) {
      errors.push({ path: `${path}.message`, message: "Timeline event message is required." });
    }
    for (const key of Object.keys(event.setTriggers ?? {})) {
      triggerKeys.add(key);
    }
  });

  return triggerKeys;
}

function validateRuleCondition(
  condition: AuthoredRuleCondition,
  path: string,
  controlKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  if (condition.source === "trigger") {
    if (!condition.key.trim()) {
      errors.push({ path: `${path}.key`, message: "Trigger condition key is required." });
    }
    return;
  }

  if (!controlKeys.has(condition.key)) {
    errors.push({
      path: `${path}.key`,
      message: `Rule references unknown control "${condition.key}".`,
    });
  }
  if (!RULE_CONDITION_OPERATORS.has(condition.operator)) {
    errors.push({
      path: `${path}.operator`,
      message: `Unsupported operator "${condition.operator}".`,
    });
  }
  if (
    (condition.operator === "at_most" || condition.operator === "at_least") &&
    typeof condition.comparedTo !== "number"
  ) {
    errors.push({
      path: `${path}.comparedTo`,
      message: `Operator "${condition.operator}" requires a numeric comparedTo value.`,
    });
  }
}

function validateRules(
  authored: AuthoredScenario,
  controlKeys: Set<string>,
  triggerKeys: Set<string>,
  stateKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  if (authored.rules.length === 0) {
    errors.push({ path: "rules", message: "At least one rule is required." });
    return;
  }

  const hasFallback = authored.rules.some((rule) => rule.when.length === 0);
  if (!hasFallback) {
    errors.push({
      path: "rules",
      message:
        "A default/fallback rule (empty `when`) is required so the scenario has deterministic behavior when no specialized rule matches.",
    });
  }

  const ids = new Set<string>();
  const nodeIds = new Set(authored.architecture.nodes.map((n) => n.id));

  authored.rules.forEach((rule, i) => {
    const path = `rules[${i}]`;
    if (ids.has(rule.id)) {
      errors.push({ path: `${path}.id`, message: `Duplicate rule id "${rule.id}".` });
    }
    ids.add(rule.id);

    rule.when.forEach((condition, j) => {
      validateRuleCondition(condition, `${path}.when[${j}]`, controlKeys, errors);
      if (condition.source === "trigger" && !triggerKeys.has(condition.key)) {
        errors.push({
          path: `${path}.when[${j}].key`,
          message: `Rule references trigger "${condition.key}" that no timeline event ever sets.`,
        });
      }
    });

    if (Object.keys(rule.setValues).length === 0) {
      errors.push({ path: `${path}.setValues`, message: "Rule must set at least one state value." });
    }
    for (const key of Object.keys(rule.setValues)) {
      if (!stateKeys.has(key)) {
        errors.push({
          path: `${path}.setValues.${key}`,
          message: `Rule sets unknown state key "${key}" (not present in initialState).`,
        });
      }
    }
    for (const nodeId of Object.keys(rule.setComponentHealth ?? {})) {
      if (!nodeIds.has(nodeId)) {
        errors.push({
          path: `${path}.setComponentHealth.${nodeId}`,
          message: `Rule references unknown architecture node "${nodeId}".`,
        });
      }
    }
  });
}

function validateStateCondition(
  condition: AuthoredStateCondition,
  path: string,
  stateKeys: Set<string>,
  triggerKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  if (!STATE_CONDITION_OPERATORS.has(condition.operator)) {
    errors.push({
      path: `${path}.operator`,
      message: `Unsupported operator "${condition.operator}".`,
    });
  }

  const source = condition.source ?? "value";
  if (source === "trigger") {
    if (!triggerKeys.has(condition.key)) {
      errors.push({
        path: `${path}.key`,
        message: `Condition references trigger "${condition.key}" that no timeline event ever sets.`,
      });
    }
    return;
  }

  if (!stateKeys.has(condition.key)) {
    errors.push({
      path: `${path}.key`,
      message: `Condition references unknown state key "${condition.key}".`,
    });
  }
}

function validateOutcomeCondition(
  outcome: AuthoredOutcomeCondition,
  path: string,
  stateKeys: Set<string>,
  triggerKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  if (outcome.conditions.length === 0) {
    errors.push({ path, message: "At least one condition is required." });
  }
  if (outcome.sustainedSeconds < 0) {
    errors.push({ path: `${path}.sustainedSeconds`, message: "Sustained duration must be >= 0." });
  }
  outcome.conditions.forEach((condition, i) => {
    validateStateCondition(condition, `${path}.conditions[${i}]`, stateKeys, triggerKeys, errors);
  });
}

function validateScoringDimension(
  config: AuthoredScoringDimensionConfig,
  path: string,
  errors: AuthoredScenarioValidationError[],
): void {
  if (!SCORING_DIMENSIONS.has(config.dimension)) {
    errors.push({ path: `${path}.dimension`, message: `Unknown scoring dimension "${config.dimension}".` });
    return;
  }

  const expectedMax = SCORE_MAX_BY_DIMENSION[config.dimension];
  if (config.maxPoints !== expectedMax) {
    errors.push({
      path: `${path}.maxPoints`,
      message: `Dimension "${config.dimension}" must use maxPoints ${expectedMax}.`,
    });
  }

  if (config.measure !== undefined && !isKnownScoringMeasure(config.measure)) {
    errors.push({ path: `${path}.measure`, message: `Unknown or malformed scoring measure "${describeMeasure(config.measure)}".` });
  }

  const hasBands = config.bands !== undefined;
  const hasPenalties = config.penalties !== undefined;
  if (hasBands && hasPenalties) {
    errors.push({
      path,
      message: "A scoring dimension may use `bands` or `penalties`, not both.",
    });
  } else if (hasPenalties) {
    validateScoringPenalties(config.penalties!, config.maxPoints, `${path}.penalties`, errors);
  } else {
    validateScoringBands(config.bands ?? [], config.maxPoints, `${path}.bands`, errors);
  }

  if (config.naturalRecoveryOverride) {
    const { points } = config.naturalRecoveryOverride;
    if (points < 0 || points > config.maxPoints) {
      errors.push({
        path: `${path}.naturalRecoveryOverride.points`,
        message: `Natural-recovery override points must be between 0 and ${config.maxPoints}.`,
      });
    }
  }

  if (config.terminalOverrides) {
    for (const key of ["failed", "unresolved"] as const) {
      const points = config.terminalOverrides[key];
      if (points !== undefined && (points < 0 || points > config.maxPoints)) {
        errors.push({
          path: `${path}.terminalOverrides.${key}`,
          message: `Terminal override points must be between 0 and ${config.maxPoints}.`,
        });
      }
    }
  }
}

function validateScoringBands(
  bands: AuthoredScoringBand[],
  maxPoints: number,
  path: string,
  errors: AuthoredScenarioValidationError[],
): void {
  if (bands.length === 0) {
    errors.push({ path, message: "At least one scoring band is required." });
  }

  const fallbackCount = bands.filter((b) => b.atMost === undefined).length;
  if (fallbackCount !== 1) {
    errors.push({
      path,
      message: "Exactly one band with no `atMost` (the fallback) is required, and it must be last.",
    });
  } else if (bands[bands.length - 1]!.atMost !== undefined) {
    errors.push({
      path,
      message: "The fallback band (no `atMost`) must be the last band.",
    });
  }

  bands.forEach((band, i) => {
    if (band.points < 0 || band.points > maxPoints) {
      errors.push({
        path: `${path}[${i}].points`,
        message: `Band points must be between 0 and ${maxPoints}.`,
      });
    }
  });
}

function validateScoringPenalties(
  penalties: AuthoredScoringPenalty[],
  maxPoints: number,
  path: string,
  errors: AuthoredScenarioValidationError[],
): void {
  if (penalties.length === 0) {
    errors.push({ path, message: "At least one penalty is required when using `penalties` mode." });
  }

  penalties.forEach((penalty, i) => {
    if (!isKnownScoringMeasure(penalty.measure)) {
      errors.push({
        path: `${path}[${i}].measure`,
        message: `Unknown or malformed scoring measure "${describeMeasure(penalty.measure)}".`,
      });
    }
    if (penalty.subtractPoints < 0 || penalty.subtractPoints > maxPoints) {
      errors.push({
        path: `${path}[${i}].subtractPoints`,
        message: `Penalty subtractPoints must be between 0 and ${maxPoints}.`,
      });
    }
  });
}

function validateScoring(
  scoring: AuthoredScenario["scoring"],
  errors: AuthoredScenarioValidationError[],
): void {
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

  const usesNaturalRecoveryOverride = scoring.dimensions.some((d) => d.naturalRecoveryOverride);
  if (usesNaturalRecoveryOverride && !scoring.naturalRecoveryCondition) {
    errors.push({
      path: "scoring.naturalRecoveryCondition",
      message: "naturalRecoveryCondition is required when any dimension sets naturalRecoveryOverride.",
    });
  }
  if (scoring.naturalRecoveryCondition) {
    const { maxBeneficialChanges, minRecoveryTimeSeconds } = scoring.naturalRecoveryCondition;
    if (maxBeneficialChanges < 0) {
      errors.push({
        path: "scoring.naturalRecoveryCondition.maxBeneficialChanges",
        message: "maxBeneficialChanges must be >= 0.",
      });
    }
    if (minRecoveryTimeSeconds < 0) {
      errors.push({
        path: "scoring.naturalRecoveryCondition.minRecoveryTimeSeconds",
        message: "minRecoveryTimeSeconds must be >= 0.",
      });
    }
  }
}

function validateEventTypeConfig(
  config: {
    enteringType: string;
    enteringMessage: string;
    recoveringType: string;
    recoveringMessage: string;
  },
  path: string,
  errors: AuthoredScenarioValidationError[],
): void {
  if (!SIMULATION_EVENT_TYPES.has(config.enteringType)) {
    errors.push({ path: `${path}.enteringType`, message: `Unknown event type "${config.enteringType}".` });
  }
  if (!SIMULATION_EVENT_TYPES.has(config.recoveringType)) {
    errors.push({ path: `${path}.recoveringType`, message: `Unknown event type "${config.recoveringType}".` });
  }
  if (!config.enteringMessage.trim()) {
    errors.push({ path: `${path}.enteringMessage`, message: "Entering message is required." });
  }
  if (!config.recoveringMessage.trim()) {
    errors.push({ path: `${path}.recoveringMessage`, message: "Recovering message is required." });
  }
}

/**
 * Severity fields must reference a declared state key, and — since a
 * severity field's value set must be exactly {normal, warning,
 * critical} — every rule that sets that key must set it to one of those
 * three strings. This is checked here (not in validateRules) because it
 * depends on which keys were declared severity fields, known only once
 * this section is reached.
 */
function validateSeverityFields(
  authored: AuthoredScenario,
  stateKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  const fields = authored.severityFields ?? [];
  const seen = new Set<string>();

  fields.forEach((field: AuthoredSeverityField, i) => {
    const path = `severityFields[${i}]`;
    if (seen.has(field.key)) {
      errors.push({ path: `${path}.key`, message: `Duplicate severity field "${field.key}".` });
    }
    seen.add(field.key);

    if (!stateKeys.has(field.key)) {
      errors.push({
        path: `${path}.key`,
        message: `Severity field references unknown state key "${field.key}".`,
      });
    }

    if (field.announceCritical) {
      validateEventTypeConfig(field.announceCritical, `${path}.announceCritical`, errors);
    }
  });

  for (const field of fields) {
    authored.rules.forEach((rule, ri) => {
      const value = rule.setValues[field.key];
      if (value !== undefined && !SEVERITY_LEVELS.has(String(value))) {
        errors.push({
          path: `rules[${ri}].setValues.${field.key}`,
          message: `Severity field "${field.key}" must be set to "normal", "warning", or "critical" — got "${String(value)}".`,
        });
      }
    });
  }
}

function validateNumericWatchFields(
  authored: AuthoredScenario,
  stateKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  const fields = authored.numericWatchFields ?? [];
  const seen = new Set<string>();

  fields.forEach((field: AuthoredNumericWatchField, i) => {
    const path = `numericWatchFields[${i}]`;
    if (seen.has(field.key)) {
      errors.push({ path: `${path}.key`, message: `Duplicate numeric watch field "${field.key}".` });
    }
    seen.add(field.key);

    if (!stateKeys.has(field.key)) {
      errors.push({
        path: `${path}.key`,
        message: `Numeric watch field references unknown state key "${field.key}".`,
      });
    } else {
      const initial = authored.initialState[field.key];
      if (typeof initial !== "number") {
        errors.push({
          path: `${path}.key`,
          message: `Numeric watch field "${field.key}" must reference a numeric initial state value.`,
        });
      }
    }

    if (field.threshold) {
      validateEventTypeConfig(field.threshold, `${path}.threshold`, errors);
    }
  });
}

function validateImpact(
  authored: AuthoredScenario,
  controlKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  const impact = authored.impact;
  if (!impact) return;

  if (impact.revenueLossRatePerMinute) {
    const incidentStates = new Set(authored.rules.map((r) => r.incidentState));
    for (const [state, rate] of Object.entries(impact.revenueLossRatePerMinute)) {
      if (!incidentStates.has(state)) {
        errors.push({
          path: `impact.revenueLossRatePerMinute.${state}`,
          message: `References incident state "${state}" that no rule ever sets.`,
        });
      }
      if (typeof rate !== "number" || rate < 0) {
        errors.push({
          path: `impact.revenueLossRatePerMinute.${state}`,
          message: "Revenue loss rate must be a non-negative number.",
        });
      }
    }
  }

  if (impact.infrastructureCost) {
    const { baselineMonthlyUsd, perUnitMonthlyUsd } = impact.infrastructureCost;
    if (typeof baselineMonthlyUsd !== "number" || baselineMonthlyUsd < 0) {
      errors.push({
        path: "impact.infrastructureCost.baselineMonthlyUsd",
        message: "Baseline monthly cost must be a non-negative number.",
      });
    }
    for (const [key, cost] of Object.entries(perUnitMonthlyUsd ?? {})) {
      const [controlKey] = key.split(":");
      if (!controlKey || !controlKeys.has(controlKey)) {
        errors.push({
          path: `impact.infrastructureCost.perUnitMonthlyUsd.${key}`,
          message: `Cost key "${key}" must be formatted "<controlKey>:<value>" referencing a known control — "${controlKey ?? ""}" is not a declared control.`,
        });
      }
      if (typeof cost !== "number") {
        errors.push({
          path: `impact.infrastructureCost.perUnitMonthlyUsd.${key}`,
          message: "Per-unit cost must be a number.",
        });
      }
    }
  }
}

function validateActionClassifications(
  authored: AuthoredScenario,
  controlKeys: Set<string>,
  triggerKeys: Set<string>,
  errors: AuthoredScenarioValidationError[],
): void {
  const classifications = authored.actionClassifications ?? [];

  classifications.forEach((rule: AuthoredActionClassification, i) => {
    const path = `actionClassifications[${i}]`;
    if (!controlKeys.has(rule.controlKey)) {
      errors.push({
        path: `${path}.controlKey`,
        message: `Action classification references unknown control "${rule.controlKey}".`,
      });
    }

    const matcherCount = [rule.valueAtMost, rule.valueAtLeast, rule.valueEquals].filter(
      (v) => v !== undefined,
    ).length;
    if (matcherCount === 0) {
      errors.push({
        path,
        message: "Action classification must set one of valueAtMost, valueAtLeast, or valueEquals.",
      });
    } else if (matcherCount > 1) {
      errors.push({
        path,
        message: "Action classification must set only one of valueAtMost, valueAtLeast, or valueEquals.",
      });
    }

    if (!ACTION_OUTCOMES.has(rule.outcome)) {
      errors.push({ path: `${path}.outcome`, message: `Unknown outcome "${rule.outcome}".` });
    }

    for (const key of Object.keys(rule.whenTriggerEquals ?? {})) {
      if (!triggerKeys.has(key)) {
        errors.push({
          path: `${path}.whenTriggerEquals.${key}`,
          message: `Action classification references trigger "${key}" that no timeline event ever sets.`,
        });
      }
    }
  });
}
