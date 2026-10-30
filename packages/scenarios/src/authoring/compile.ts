import type {
  ActionClassificationRule,
  ArchitectureDefinition,
  ComponentHealth,
  ControlDefinition,
  ControlValue,
  InfrastructureCostConfig,
  NumericWatchFieldConfig,
  RevenueLossRatePerMinute,
  Rule,
  RuleCondition,
  ScenarioSimulationDefinition,
  SeverityFieldConfig,
  StateCondition,
  StateValue,
  TimedEvent,
} from "@incidentrank/simulator";
import type { ScenarioDefinition } from "../types";
import type {
  AuthoredActionClassification,
  AuthoredControlCondition,
  AuthoredNumericWatchField,
  AuthoredRule,
  AuthoredScenario,
  AuthoredSeverityField,
  AuthoredStateCondition,
} from "./schema";
import { validateAuthoredScenario } from "./validate";
import type { AuthoredScenarioValidationError } from "./errors";

export type CompileAuthoredScenarioResult =
  | { ok: true; definition: ScenarioDefinition }
  | { ok: false; errors: AuthoredScenarioValidationError[] };

const DEFAULT_TICK_MS = 1_000;

/**
 * Pure function: validates and normalizes a persisted authored scenario
 * document into a simulator-compatible ScenarioDefinition. No React, no
 * Clerk, no DB access — safe to call from any layer (API routes, preview,
 * resume resolution, tests). Per the spec, never returns a partially-built
 * definition on validation failure — callers that need an executable
 * definition (publish, resolveSimulationDefinition) must check `ok`.
 *
 * `raw` is untyped (unknown) because it is read back from `jsonb` storage
 * — this function is the one place that boundary gets asserted against
 * AuthoredScenario's shape via structural validation.
 */
export function compileAuthoredScenario(raw: unknown): CompileAuthoredScenarioResult {
  const authored = raw as AuthoredScenario;

  const errors = validateAuthoredScenario(authored);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const controls: ControlDefinition[] = authored.controls.map((control) => ({
    key: control.key,
    allowedValues: control.allowedValues as ControlValue[],
    initialValue: control.initialValue,
  }));

  const architecture: ArchitectureDefinition = {
    nodes: authored.architecture.nodes.map((node) => ({ id: node.id, label: node.label })),
    edges: authored.architecture.edges.map((edge) => ({ from: edge.from, to: edge.to })),
  };

  const initialComponentHealth: Record<string, ComponentHealth> = Object.fromEntries(
    authored.architecture.nodes.map((node) => [node.id, "healthy" as ComponentHealth]),
  );

  const timedEvents: TimedEvent[] = authored.timelineEvents.map((event) => ({
    id: event.id,
    atMs: event.atSeconds * 1_000,
    type: Object.keys(event.setTriggers ?? {}).length > 0 ? "TRIGGER_SET" : "STATUS_CHANGED",
    message: event.message,
    setTriggers: event.setTriggers,
  }));

  const rules: Rule[] = authored.rules.map((rule) => compileRule(rule));

  const successCondition = {
    conditions: authored.successCondition.conditions.map(compileStateCondition),
    sustainedSeconds: authored.successCondition.sustainedSeconds,
  };
  const failureCondition = {
    conditions: authored.failureCondition.conditions.map(compileStateCondition),
    sustainedSeconds: authored.failureCondition.sustainedSeconds,
  };

  // Phase 6 addendum: severityFields/numericWatchFields/impact/
  // actionClassifications are now authored, declarative sections (see
  // schema.ts's own doc comment on each) — compiled below via direct,
  // 1:1 mirrors of the simulator's own types. An authored document that
  // omits any of these (including every document persisted before this
  // addition) still compiles to the exact same safe empty/zeroed
  // defaults Phase 5 always used, so no existing scenario's compiled
  // behavior changes.
  const severityFields: SeverityFieldConfig[] = (authored.severityFields ?? []).map(
    compileSeverityField,
  );
  const numericWatchFields: NumericWatchFieldConfig[] = (
    authored.numericWatchFields ?? []
  ).map(compileNumericWatchField);
  const revenueLossRatePerMinute: RevenueLossRatePerMinute =
    authored.impact?.revenueLossRatePerMinute ?? {};
  const infrastructureCost: InfrastructureCostConfig = authored.impact?.infrastructureCost ?? {
    baselineMonthlyUsd: 0,
    perUnitMonthlyUsd: {},
  };
  const actionClassifications: ActionClassificationRule[] = (
    authored.actionClassifications ?? []
  ).map(compileActionClassification);

  // Phase 6.1: omitting `completion` entirely compiles to no `completion`
  // field at all on the simulation definition, which the engine itself
  // defaults to { mode: "automatic" } (see tick.ts) — identical behavior
  // to every scenario compiled before this addition.
  const completion: ScenarioSimulationDefinition["completion"] = authored.completion
    ? {
        mode: authored.completion.mode,
        acceptableCondition: authored.completion.acceptableCondition
          ? {
              conditions: authored.completion.acceptableCondition.conditions.map(
                compileStateCondition,
              ),
              sustainedSeconds: authored.completion.acceptableCondition.sustainedSeconds,
            }
          : undefined,
      }
    : undefined;

  const simulation: ScenarioSimulationDefinition = {
    tickMs: DEFAULT_TICK_MS,
    architecture,
    controls,
    initialValues: authored.initialState as Record<string, StateValue>,
    initialComponentHealth,
    severityFields,
    numericWatchFields,
    timedEvents,
    rules,
    revenueLossRatePerMinute,
    infrastructureCost,
    successCondition,
    failureCondition,
    actionClassifications,
    completion,
  };

  const definition: ScenarioDefinition = {
    id: authored.basics.slug,
    slug: authored.basics.slug,
    version: 1,
    name: authored.basics.name,
    description: authored.basics.description,
    difficulty: authored.basics.difficulty,
    estimatedMinutes: authored.basics.estimatedMinutes,
    isFree: false,
    // Phase 10F: missing on every scenario authored before this phase —
    // default to "linear", the literal truth of every pre-existing
    // authored scenario (none used branching/parallel/cascading rule
    // topology on purpose). domain/primarySkill/secondarySkills stay on
    // AuthoredBasics only (queryable from definitionJson directly) —
    // not threaded into the compiled definition, since org-authored
    // scenarios never set `library` and are never library-listed.
    structure: authored.basics.structure ?? "linear",
    simulation,
  };

  return { ok: true, definition };
}

function compileRule(rule: AuthoredRule): Rule {
  const when: RuleCondition = {};
  const triggerEquals: Record<string, boolean> = {};
  const controlEquals: Record<string, ControlValue> = {};
  const controlAtMost: Record<string, number> = {};
  const controlAtLeast: Record<string, number> = {};

  for (const condition of rule.when) {
    if (condition.source === "trigger") {
      triggerEquals[condition.key] = condition.equals;
      continue;
    }
    compileControlCondition(condition, controlEquals, controlAtMost, controlAtLeast);
  }

  if (Object.keys(triggerEquals).length > 0) when.triggerEquals = triggerEquals;
  if (Object.keys(controlEquals).length > 0) when.controlEquals = controlEquals;
  if (Object.keys(controlAtMost).length > 0) when.controlAtMost = controlAtMost;
  if (Object.keys(controlAtLeast).length > 0) when.controlAtLeast = controlAtLeast;

  return {
    id: rule.id,
    when,
    incidentState: rule.incidentState,
    values: rule.setValues as Record<string, StateValue>,
    componentHealth: (rule.setComponentHealth ?? {}) as Record<string, ComponentHealth>,
  };
}

function compileControlCondition(
  condition: AuthoredControlCondition,
  controlEquals: Record<string, ControlValue>,
  controlAtMost: Record<string, number>,
  controlAtLeast: Record<string, number>,
): void {
  switch (condition.operator) {
    case "equals":
      controlEquals[condition.key] = condition.comparedTo;
      return;
    case "at_most":
      controlAtMost[condition.key] = condition.comparedTo as number;
      return;
    case "at_least":
      controlAtLeast[condition.key] = condition.comparedTo as number;
      return;
  }
}

function compileStateCondition(condition: AuthoredStateCondition): StateCondition {
  return {
    key: condition.key,
    source: condition.source === "trigger" ? "trigger" : "value",
    operator: condition.operator,
    comparedTo: condition.comparedTo,
  };
}

function compileSeverityField(field: AuthoredSeverityField): SeverityFieldConfig {
  return {
    key: field.key,
    ...(field.announceCritical ? { announceCritical: field.announceCritical } : {}),
  };
}

function compileNumericWatchField(field: AuthoredNumericWatchField): NumericWatchFieldConfig {
  return {
    key: field.key,
    trackPeak: field.trackPeak,
    ...(field.threshold ? { threshold: field.threshold } : {}),
  };
}

function compileActionClassification(
  rule: AuthoredActionClassification,
): ActionClassificationRule {
  return {
    ...(rule.id !== undefined ? { id: rule.id } : {}),
    controlKey: rule.controlKey,
    ...(rule.valueAtMost !== undefined ? { valueAtMost: rule.valueAtMost as number } : {}),
    ...(rule.valueAtLeast !== undefined ? { valueAtLeast: rule.valueAtLeast as number } : {}),
    ...(rule.valueEquals !== undefined
      ? { valueEquals: rule.valueEquals as ControlValue }
      : {}),
    ...(rule.whenTriggerEquals ? { whenTriggerEquals: rule.whenTriggerEquals } : {}),
    outcome: rule.outcome,
    ...(rule.feedback ? { feedback: rule.feedback } : {}),
  };
}
