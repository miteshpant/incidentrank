// ─────────────────────────────────────────────────────────────────────────
// Authored scenario schema (Phase 5) — the serialized, no-code shape a
// company author edits and that gets persisted as
// scenario_versions.definitionJson. compileAuthoredScenario turns this
// into a simulator-compatible ScenarioSimulationDefinition.
//
// This schema deliberately mirrors the generic simulator's own structured
// primitives (packages/simulator/src/types.ts) rather than inventing a
// parallel vocabulary — the two Phase 5 sub-tasks ("define a serialized
// scenario schema" and "it must map cleanly to ScenarioDefinition") are
// easiest to keep honest when the authored shape and the compiled shape
// use the same condition/operator/effect primitives throughout. Per the
// spec and the engine-generalization mandate: no code, no JavaScript, no
// string eval, no arbitrary expressions — only the same safe structured
// primitives the engine already supports (compare, set, increment/
// decrement, emit authored event, duration-based conditions).
// ─────────────────────────────────────────────────────────────────────────

export type AuthoredDifficulty = "beginner" | "intermediate" | "senior" | "staff";

export type AuthoredNodeType =
  | "service"
  | "database"
  | "queue"
  | "external"
  | "client"
  | "other";

export type AuthoredComparisonOperator =
  | "equals"
  | "not_equals"
  | "less_than"
  | "less_than_or_equal"
  | "greater_than"
  | "greater_than_or_equal";

export type AuthoredMetricFormat =
  | "number"
  | "percentage"
  | "duration"
  | "currency"
  | "status";

export type AuthoredScoringDimension =
  | "recovery"
  | "customerImpact"
  | "dataIntegrity"
  | "reliability"
  | "costEfficiency"
  | "operationalEfficiency";

// 1. Basics
export interface AuthoredBasics {
  name: string;
  slug: string;
  description: string;
  difficulty: AuthoredDifficulty;
  estimatedMinutes: number;
  /** Shown to the candidate before/during the attempt. Never includes hidden solution information. */
  instructions?: string;
}

// 2. Architecture
export interface AuthoredArchitectureNode {
  id: string;
  label: string;
  type: AuthoredNodeType;
}

export interface AuthoredArchitectureEdge {
  from: string;
  to: string;
  label?: string;
}

export interface AuthoredArchitecture {
  nodes: AuthoredArchitectureNode[];
  edges: AuthoredArchitectureEdge[];
}

// 3. Controls
export type AuthoredControlType = "select" | "toggle";
export type AuthoredControlValue = string | number | boolean;

export interface AuthoredControl {
  key: string;
  label: string;
  type: AuthoredControlType;
  /** For type "toggle", must be exactly [false, true]. */
  allowedValues: AuthoredControlValue[];
  initialValue: AuthoredControlValue;
  /** The architecture node this control is shown under in the candidate
   * console (packages/simulator has no concept of this — purely
   * candidate-facing grouping, mirroring the built-in UI's
   * COMPONENT_CONTROL_KEYS but authored instead of hardcoded). */
  componentId: string;
}

// 4. Initial State
export type AuthoredStateValue = number | string;
export type AuthoredInitialState = Record<string, AuthoredStateValue>;

// 5. Metrics
export interface AuthoredMetric {
  key: string;
  label: string;
  /** The state key this metric reads its live value from. */
  sourceStateKey: string;
  format: AuthoredMetricFormat;
}

// 6. Timeline Events
export interface AuthoredTimelineEvent {
  id: string;
  /** Seconds from incident start. */
  atSeconds: number;
  label: string;
  message: string;
  /** Named boolean triggers this event sets, read by rule conditions. */
  setTriggers?: Record<string, boolean>;
}

// 7. Rules & Consequences
//
// Rule conditions deliberately can reference ONLY triggers (set by timed
// events) and control values (set by the candidate) — never `values`
// directly. This mirrors a real engine constraint, not an authoring
// limitation to be worked around: the simulator's Rule/RuleCondition
// (packages/simulator/src/types.ts) matches rules against "what happened"
// (triggers, candidate control choices), then supplies a complete
// authored snapshot of `values` as the consequence. Letting rules branch
// on current `values` would create feedback loops between rule inputs and
// rule outputs, which breaks the "WHEN condition THEN authored
// consequence" model the product principle requires. Success/failure
// conditions below, by contrast, DO read `values` — they evaluate the
// *result* of whichever rule matched, not the rule match itself.
// "not_equals" is deliberately absent: the simulator's RuleCondition has
// no native "control does not equal X" bucket (only controlEquals,
// controlAtMost, controlAtLeast, and triggerEquals) — see
// packages/simulator/src/types.ts. Authors needing "not X" for a select
// control should express it as the complement set of allowed values via
// a separate rule, keeping the compiled output a direct, honest mapping
// of what's authored rather than a synthesized workaround.
export type AuthoredRuleConditionOperator = "equals" | "at_most" | "at_least";

export interface AuthoredTriggerCondition {
  source: "trigger";
  key: string;
  equals: boolean;
}

export interface AuthoredControlCondition {
  source: "control";
  key: string;
  operator: AuthoredRuleConditionOperator;
  comparedTo: AuthoredControlValue;
}

export type AuthoredRuleCondition = AuthoredTriggerCondition | AuthoredControlCondition;

export interface AuthoredRule {
  id: string;
  label?: string;
  /** All conditions must hold (AND) for this rule to match. Empty = always matches (fallback). */
  when: AuthoredRuleCondition[];
  incidentState: string;
  /** Authored snapshot of state values while this rule is matched. */
  setValues: Record<string, AuthoredStateValue>;
  /** Authored snapshot of component health while this rule is matched. */
  setComponentHealth?: Record<string, "healthy" | "degraded" | "critical">;
}

// 8. Success / Failure — evaluated against the currently matched rule's
// authored `values` (and triggers), never against controls directly.
export interface AuthoredStateCondition {
  key: string;
  source?: "value" | "trigger";
  operator: AuthoredComparisonOperator;
  comparedTo: AuthoredStateValue | boolean;
}

export interface AuthoredOutcomeCondition {
  conditions: AuthoredStateCondition[];
  sustainedSeconds: number;
}

// 9. Scoring — Option B: authored bands on the existing fixed dimensions.
export interface AuthoredScoringBand {
  /** Upper bound (inclusive) for this band, in the dimension's native unit
   * (seconds for recovery time, USD for revenue loss, etc). Omit for the
   * final catch-all band. */
  atMost?: number;
  points: number;
}

/**
 * Phase 6 addendum — the measure a scoring dimension bands/penalizes
 * against. Each dimension previously had exactly one hardcoded implicit
 * measure (see the old authoring/score.ts measureDimension switch); this
 * closed set makes that choice explicit and extends it with the
 * additional derived measures needed to express Payment Retry Storm's
 * existing bespoke scorer declaratively (packages/scoring/src/
 * payment-retry-storm.ts), so built-in and authored scenario scoring can
 * converge on one generic engine. All are deterministic functions of
 * ScoringInputs — no new engine code, no formulas beyond simple ratios/
 * counts the engine already computes.
 */
export type AuthoredScoringMeasure =
  | "recoveryTimeSeconds"
  | "revenueLossUsd"
  | "dataIntegrity"
  | "criticalTimeRatio"
  | "costIncreaseRatio"
  | "harmfulChangeCount"
  | "configurationChangeCount";

/**
 * Declares when an attempt counts as "natural recovery" — the incident
 * resolved purely because the scenario's own timeline recovered on
 * schedule, with no beneficial candidate intervention — generalizing
 * Payment Retry Storm's hardcoded isNaturalRecovery check into
 * declarative, per-scenario-tunable config. Every scenario's "recovery
 * took a long time but the candidate did nothing helpful" case should use
 * this rather than a scenario-specific condition.
 */
export interface AuthoredNaturalRecoveryCondition {
  /** Natural recovery requires numberOfBeneficialChanges to be at most this (typically 0). */
  maxBeneficialChanges: number;
  /** Natural recovery additionally requires recovery time to be at least this many seconds (the incident "resolved on its own schedule," not quickly). */
  minRecoveryTimeSeconds: number;
}

/**
 * A single penalty rule for a "penalties" dimension (see
 * AuthoredScoringDimensionConfig.penalties): when `measure` is at least
 * `atLeast`, subtract `subtractPoints` from that dimension's maxPoints.
 * Multiple matching penalties stack additively; the result is floored at
 * 0. This generalizes Payment Retry Storm's operationalEfficiency, which
 * independently penalizes harmful-change count and configuration-change
 * count rather than banding a single measure.
 */
export interface AuthoredScoringPenalty {
  measure: AuthoredScoringMeasure;
  atLeast: number;
  subtractPoints: number;
}

export interface AuthoredScoringDimensionConfig {
  dimension: AuthoredScoringDimension;
  maxPoints: number;
  /**
   * The measure this dimension bands (or penalizes) against. Optional —
   * omitting it preserves the exact Phase 5 implicit mapping
   * (recovery->recoveryTimeSeconds, customerImpact->revenueLossUsd,
   * dataIntegrity->dataIntegrity, reliability->criticalTimeRatio,
   * costEfficiency->costIncreaseRatio, operationalEfficiency->
   * harmfulChangeCount) so every authored scenario persisted before this
   * addition keeps compiling and scoring identically.
   */
  measure?: AuthoredScoringMeasure;
  /**
   * Ordered ascending by `atMost`; the first band whose `atMost` the
   * measured value satisfies wins; a band with no `atMost` always matches
   * as the fallback and must be last. Mutually exclusive with `penalties`
   * — a dimension config uses exactly one scoring mode.
   */
  bands?: AuthoredScoringBand[];
  /**
   * Alternative to `bands`: start this dimension at `maxPoints` and
   * subtract every matching penalty (see AuthoredScoringPenalty),
   * floored at 0. Mutually exclusive with `bands`.
   */
  penalties?: AuthoredScoringPenalty[];
  /**
   * When set and the attempt satisfies the scoring config's
   * `naturalRecoveryCondition`, this dimension is awarded exactly
   * `points` instead of being banded/penalized at all — generalizing
   * Payment Retry Storm's fixed 40-point recovery / 20-point reliability
   * natural-recovery awards.
   */
  naturalRecoveryOverride?: { points: number };
  /**
   * Explicit semantic outcomes for an attempt that never successfully
   * resolved, checked before naturalRecoveryOverride/bands/penalties —
   * generalizing Payment Retry Storm's `if (resolvedAtMs === null) return
   * 0` guards on its recovery/reliability dimensions. `failed` applies
   * when the attempt's failure condition was met (failedAtMs !== null);
   * `unresolved` applies when the attempt ended with neither success nor
   * failure recorded (e.g. time ran out mid-attempt). Deliberately two
   * separate, author-controlled outcomes rather than one collapsed
   * "didn't resolve" case or a sentinel numeric measure value — a future
   * scenario may legitimately want to score these differently (e.g.
   * partial credit for "ran out of time while still improving" vs. "made
   * it actively worse"). Omit either (or both) to fall through to the
   * normal naturalRecoveryOverride/bands/penalties evaluation for that
   * outcome, preserving the exact Phase 5/early-Phase-6 behavior for any
   * dimension that doesn't need this distinction.
   */
  terminalOverrides?: {
    failed?: number;
    unresolved?: number;
  };
}

export interface AuthoredScoringConfig {
  dimensions: AuthoredScoringDimensionConfig[];
  /**
   * Declares the natural-recovery condition any dimension's
   * `naturalRecoveryOverride` is evaluated against. Required only if at
   * least one dimension declares `naturalRecoveryOverride`.
   */
  naturalRecoveryCondition?: AuthoredNaturalRecoveryCondition;
}

// 10. Severity fields, numeric watch fields, impact/cost, action
// classification — Phase 6 addendum. These close the Phase 5 compiler
// gap documented in compile.ts: previously every authored scenario
// compiled with severityFields/numericWatchFields/revenueLossRatePerMinute/
// infrastructureCost/actionClassifications all zeroed/empty, regardless
// of what the author actually wrote, because the authoring schema had no
// section for them at all. Each addition below is a direct, declarative
// mirror of the simulator's own already-existing, already-engine-
// supported types (packages/simulator/src/types.ts) — no new engine
// code, no formulas, no code/expression evaluation. All four sections are
// optional; omitting them (or persisting an older document that predates
// this addition) compiles to the exact same safe empty/zeroed defaults
// Phase 5 already used, so no existing authored scenario's compiled
// behavior changes.

/** The same closed set of simulation event types the engine already defines (packages/simulator/src/types.ts's SimulationEventType) — authors pick one, never invent a new one. */
export type AuthoredSimulationEventType =
  | "INCIDENT_STARTED"
  | "TRIGGER_SET"
  | "STATUS_CHANGED"
  | "CONFIG_CHANGED"
  | "CONFIG_CHANGE_REJECTED"
  | "SEVERITY_CRITICAL"
  | "SEVERITY_RECOVERED"
  | "THRESHOLD_CROSSED"
  | "THRESHOLD_RECOVERED"
  | "INCIDENT_RESOLVED"
  | "INCIDENT_FAILED";

/**
 * Declares that a string-valued state key is a "severity field" — its
 * value set is exactly {normal, warning, critical} (enforced by
 * validation: every rule's `setValues[key]`, if present, must be one of
 * those three strings) — mirroring the simulator's SeverityFieldConfig
 * exactly. `announceCritical` is optional: a scenario may track a
 * severity field for peak/time-in-critical scoring bookkeeping without
 * narrating a timeline event for it.
 */
export interface AuthoredSeverityField {
  key: string;
  announceCritical?: {
    enteringType: AuthoredSimulationEventType;
    enteringMessage: string;
    recoveringType: AuthoredSimulationEventType;
    recoveringMessage: string;
  };
}

/**
 * Declares that a numeric state key should be peak-tracked and/or
 * narrated with a threshold-crossing event — mirrors
 * NumericWatchFieldConfig exactly. `trackPeak` alone (no `threshold`) is
 * valid: the engine still records the peak value in
 * state.peaks.peakValues for scoring, just never announces a crossing.
 */
export interface AuthoredNumericWatchField {
  key: string;
  trackPeak: boolean;
  threshold?: {
    value: number;
    enteringType: AuthoredSimulationEventType;
    enteringMessage: string;
    recoveringType: AuthoredSimulationEventType;
    recoveringMessage: string;
  };
}

/**
 * Revenue-loss-per-minute, keyed by `incidentState` (the same string a
 * rule's `incidentState` field sets) — mirrors RevenueLossRatePerMinute
 * exactly. A state with no entry here loses no revenue while matched.
 */
export type AuthoredRevenueLossRatePerMinute = Record<string, number>;

/**
 * Baseline + per-unit-value infrastructure cost, mirroring
 * InfrastructureCostConfig exactly. `perUnitMonthlyUsd` is keyed by
 * `"<controlKey>:<value>"` (e.g. `"dbPoolSize:100"`) — the authored
 * equivalent of the engine's own per-control-value cost lookup, applied
 * additively on top of `baselineMonthlyUsd` for whichever control values
 * are currently set.
 */
export interface AuthoredInfrastructureCost {
  baselineMonthlyUsd: number;
  perUnitMonthlyUsd: Record<string, number>;
}

export interface AuthoredImpactConfig {
  revenueLossRatePerMinute?: AuthoredRevenueLossRatePerMinute;
  infrastructureCost?: AuthoredInfrastructureCost;
}

/**
 * Per-control-value classification of a candidate action as beneficial/
 * neutral/harmful, used only for the operationalEfficiency scoring
 * dimension's bookkeeping — never for resolution/rule-matching logic,
 * mirroring ActionClassificationRule exactly. At most one of
 * `valueAtMost`/`valueAtLeast`/`valueEquals` should be set per rule;
 * `whenTriggerEquals` optionally narrows the rule to only apply once a
 * given trigger state holds (e.g. "setting retries above 3 is harmful,
 * but only once the provider is already degraded").
 */
export interface AuthoredActionClassification {
  controlKey: string;
  valueAtMost?: AuthoredControlValue;
  valueAtLeast?: AuthoredControlValue;
  valueEquals?: AuthoredControlValue;
  whenTriggerEquals?: Record<string, boolean>;
  outcome: "beneficial" | "neutral" | "harmful";
}

// Full authored scenario
export interface AuthoredScenario {
  /** Schema version of this authored document shape, independent of the
   * scenario's own content version — lets compileAuthoredScenario evolve
   * without breaking already-persisted definitionJson rows. */
  schemaVersion: 1;

  basics: AuthoredBasics;
  architecture: AuthoredArchitecture;
  controls: AuthoredControl[];
  initialState: AuthoredInitialState;
  metrics: AuthoredMetric[];
  timelineEvents: AuthoredTimelineEvent[];
  rules: AuthoredRule[];
  successCondition: AuthoredOutcomeCondition;
  failureCondition: AuthoredOutcomeCondition;
  scoring: AuthoredScoringConfig;

  /** Optional — omitting compiles to the same empty/zeroed defaults Phase 5 always used. */
  severityFields?: AuthoredSeverityField[];
  numericWatchFields?: AuthoredNumericWatchField[];
  impact?: AuthoredImpactConfig;
  actionClassifications?: AuthoredActionClassification[];
}
