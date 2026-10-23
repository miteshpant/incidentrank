// ─────────────────────────────────────────────────────────────────────────
// Candidate controls — a scenario declares which controls exist and which
// values are legal for each. The engine validates actions against these.
// ─────────────────────────────────────────────────────────────────────────

export type ControlValue = string | number | boolean;

export interface ControlDefinition<TValue extends ControlValue = ControlValue> {
  key: string;
  allowedValues: readonly TValue[];
  initialValue: TValue;
}

export interface CandidateAction {
  id: string;
  timestampMs: number;
  controlKey: string;
  value: ControlValue;
}

export type ActionOutcome = "beneficial" | "neutral" | "harmful";

// ─────────────────────────────────────────────────────────────────────────
// Generic state values — Phase 5 generalization. A scenario's incident
// state is an open bag of author-named fields, each either numeric (a
// metric) or a string "severity-like" value (e.g. "normal" | "warning" |
// "critical", or any other author-chosen string enum). The engine has no
// built-in knowledge of what any field means; it only knows the generic
// shape declared below. This is what lets Phase 5 author-defined scenarios
// (e.g. a database-saturation incident with no "checkout"/"payment"
// concept at all) run through the exact same engine as Payment Retry
// Storm, per docs/architecture.md principle 6.
// ─────────────────────────────────────────────────────────────────────────

export type StateValue = number | string;

export type SeverityLevel = "normal" | "warning" | "critical";

/**
 * A scenario declares which of its string-valued state fields are
 * "severity fields" — fields whose value set is exactly
 * {normal, warning, critical} and which participate in peak-severity
 * tracking and critical/degraded time-in-state bookkeeping. Payment Retry
 * Storm declares `paymentTraffic` and `dbPressure` as severity fields,
 * generalizing its old hardcoded severityRank() computation.
 */
export interface SeverityFieldConfig {
  key: string;
  /** Emit a *_CRITICAL / *_RECOVERED-style event when this field crosses
   * into/out of "critical". Optional — a scenario may track a severity
   * field for peak/time bookkeeping without narrating it in the timeline. */
  announceCritical?: {
    enteringType: SimulationEventType;
    enteringMessage: string;
    recoveringType: SimulationEventType;
    recoveringMessage: string;
  };
}

/**
 * A scenario declares which of its numeric state fields should be
 * peak-tracked (the engine records the maximum value reached during the
 * attempt) and, optionally, narrated with a threshold-crossing event —
 * generalizing Payment Retry Storm's hardcoded Kafka-backlog tracking.
 */
export interface NumericWatchFieldConfig {
  key: string;
  /** Track this field's maximum observed value in state.peaks.peakValues. */
  trackPeak: boolean;
  /** Emit a threshold-crossing event when the value crosses `threshold`. */
  threshold?: {
    value: number;
    enteringType: SimulationEventType;
    enteringMessage: string;
    recoveringType: SimulationEventType;
    recoveringMessage: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Component architecture — static topology plus per-component health, for
// future candidate-facing display. Health is derived from the matched rule,
// not computed.
// ─────────────────────────────────────────────────────────────────────────

export type ComponentHealth = "healthy" | "degraded" | "critical";

export interface ArchitectureNode {
  id: string;
  label: string;
}

export interface ArchitectureEdge {
  from: string;
  to: string;
}

export interface ArchitectureDefinition {
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
}

// ─────────────────────────────────────────────────────────────────────────
// Rules — an ordered list of authored condition → consequence mappings.
// The engine evaluates them top-to-bottom each tick and applies the first
// match. This is the declarative replacement for formulas.
// ─────────────────────────────────────────────────────────────────────────

export interface RuleCondition {
  /** Matches against the generic named boolean triggers a scenario's timed
   * events set (e.g. { providerDegraded: true } for Payment Retry Storm),
   * generalizing the old hardcoded `providerDegraded` field. */
  triggerEquals?: Record<string, boolean>;
  controlEquals?: Record<string, ControlValue>;
  controlAtMost?: Record<string, number>;
  controlAtLeast?: Record<string, number>;
}

export interface Rule {
  id: string;
  when: RuleCondition;
  incidentState: string;
  /** Authored snapshot of every generic state value while this rule is
   * matched — never derived from a formula. */
  values: Record<string, StateValue>;
  componentHealth: Record<string, ComponentHealth>;
}

// ─────────────────────────────────────────────────────────────────────────
// Timed events — authored, scenario-time-triggered transitions (e.g. the
// provider degrading at T=60s, or recovering starting at T=12min).
// ─────────────────────────────────────────────────────────────────────────

export interface TimedEvent {
  id: string;
  atMs: number;
  type: SimulationEventType;
  message: string;
  /** Sets a named generic trigger flag, generalizing the old
   * setProviderDegraded/setProviderRecovering fields. Any key a scenario's
   * rules reference via `triggerEquals` may be set here. */
  setTriggers?: Record<string, boolean>;
}

// ─────────────────────────────────────────────────────────────────────────
// Revenue loss / infrastructure cost — authored per-minute rates keyed by
// incident state, and authored per-unit cost increments for scaling.
// ─────────────────────────────────────────────────────────────────────────

export interface RevenueLossRatePerMinute {
  [incidentState: string]: number;
}

export interface InfrastructureCostConfig {
  baselineMonthlyUsd: number;
  perUnitMonthlyUsd: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────
// Success / failure conditions — structured conditions evaluated against
// the currently matched rule's authored state values. Generalizes the old
// fixed minCheckoutSuccessRate/maxCheckoutP99LatencyMs/etc. fields into an
// open list of StateCondition checks, per Phase 5's authoring model.
// ─────────────────────────────────────────────────────────────────────────

export type ComparisonOperator =
  | "equals"
  | "not_equals"
  | "less_than"
  | "less_than_or_equal"
  | "greater_than"
  | "greater_than_or_equal";

export interface StateCondition {
  /** Reads from state.values[key] (or state.triggers[key] if
   * `source: "trigger"`). */
  key: string;
  source?: "value" | "trigger";
  operator: ComparisonOperator;
  comparedTo: StateValue | boolean;
}

export interface SuccessCondition {
  conditions: StateCondition[];
  sustainedSeconds: number;
}

export interface FailureCondition {
  conditions: StateCondition[];
  sustainedSeconds: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Completion mode (Phase 6.1) — "automatic" (default, unchanged prior
// behavior): the engine itself flips status to "resolved" the instant
// successCondition has been sustained long enough. "candidate_declared":
// the engine tracks the exact same sustain-window bookkeeping
// (transitions.consecutiveSuccessSeconds) but never auto-resolves on it —
// the attempt stays "critical"/"degraded"/"healthy" indefinitely until
// either the candidate explicitly declares completion (evaluated
// server-side against this same tracked state, never a second parallel
// evaluator — see apps/web/src/lib/server/finish-attempt.ts) or the
// failure condition fires automatically (failure is never gated by
// completion mode — see tick.ts).
//
// acceptableCondition is optional and only meaningful for
// candidate_declared scenarios: a second, looser bar representing a
// deliberate, genuinely-safe-but-imperfect handback state (distinct from
// successCondition's full/optimal recovery bar). Both conditions track
// their own independent sustain windows in parallel; Finish succeeds if
// EITHER has been sustained long enough, with successCondition taking
// priority (scored as "optimal") over acceptableCondition ("acceptable")
// when both are currently satisfied. Omitting it (every automatic
// scenario, and any candidate_declared scenario with no genuine safe-but-
// imperfect tier) means only the full successCondition can ever Finish to
// resolved.
export type CompletionMode = "automatic" | "candidate_declared";

export interface CompletionConfig {
  mode: CompletionMode;
  acceptableCondition?: SuccessCondition;
}

// ─────────────────────────────────────────────────────────────────────────
// Action classification — authored per control+value, used only for
// scoring-input bookkeeping (never for resolution logic itself).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Phase 6.1: candidate-facing post-incident educational explanation for
 * why a classification was beneficial/harmful/neutral — e.g. "Reduced
 * retry amplification" / "Lowering retries reduced pressure on the
 * degraded payment provider." Presentation metadata only: never read by
 * simulate()/tick.ts resolution logic, never affects scoring. Hidden
 * authored evaluator metadata — must never cross the live candidate API
 * boundary (see apps/web/src/lib/server/action-feedback.ts's
 * sanitization). Optional: a neutral/no-op classification does not need
 * prose.
 */
export interface ActionFeedback {
  title: string;
  explanation: string;
}

export interface ActionClassificationRule {
  /** Stable identity for this rule, persisted as matchedRuleId at the
   * moment an action is classified (never re-derived later by
   * re-running classifyAction against final state, since
   * whenTriggerEquals-gated rules can match differently at different
   * points in time). Optional — when omitted, classifyAction falls back
   * to the rule's array index, which is equally stable as long as
   * authors don't reorder existing rules. */
  id?: string;
  controlKey: string;
  valueAtMost?: number;
  valueAtLeast?: number;
  valueEquals?: ControlValue;
  /** Matches against a named trigger instead of the old fixed
   * whenProviderDegraded boolean. Omit to match regardless of triggers. */
  whenTriggerEquals?: Record<string, boolean>;
  outcome: ActionOutcome;
  /** Optional authored post-incident explanation — see ActionFeedback's
   * doc comment. */
  feedback?: ActionFeedback;
}

// ─────────────────────────────────────────────────────────────────────────
// Scenario definition consumed by the engine — entirely declarative data.
// ─────────────────────────────────────────────────────────────────────────

export interface ScenarioSimulationDefinition {
  tickMs: number;
  architecture: ArchitectureDefinition;
  controls: ControlDefinition[];
  initialValues: Record<string, StateValue>;
  initialComponentHealth: Record<string, ComponentHealth>;
  severityFields: SeverityFieldConfig[];
  numericWatchFields: NumericWatchFieldConfig[];
  timedEvents: TimedEvent[];
  rules: Rule[];
  revenueLossRatePerMinute: RevenueLossRatePerMinute;
  infrastructureCost: InfrastructureCostConfig;
  successCondition: SuccessCondition;
  failureCondition: FailureCondition;
  actionClassifications: ActionClassificationRule[];
  /** Defaults to { mode: "automatic" } when omitted — every scenario
   * compiled before Phase 6.1 behaves identically with no changes. */
  completion?: CompletionConfig;
}

// ─────────────────────────────────────────────────────────────────────────
// Simulation events
// ─────────────────────────────────────────────────────────────────────────

export type SimulationEventType =
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

export interface SimulationEvent {
  id: string;
  timestampMs: number;
  type: SimulationEventType;
  message: string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────
// Full simulation state — serializable, no hidden mutable state.
// ─────────────────────────────────────────────────────────────────────────

export type IncidentStatus = "healthy" | "degraded" | "critical" | "resolved" | "failed";

export interface CustomerImpactState {
  revenueLossUsd: number;
  totalTimeInCriticalMs: number;
  totalTimeInDegradedMs: number;
}

export interface CostState {
  currentMonthlyCostUsd: number;
}

export interface TransitionTrackingState {
  matchedRuleId: string | null;
  incidentState: string;
  consecutiveSuccessSeconds: number;
  consecutiveFailureSeconds: number;
  /** Phase 6.1: mirrors consecutiveSuccessSeconds's exact sustain-window
   * mechanics (resets to 0 whenever the condition goes false) but tracks
   * a scenario's optional completion.acceptableCondition instead of
   * successCondition. Always computed, even for scenarios with no
   * acceptableCondition defined (where it simply stays 0) or automatic-
   * mode scenarios — cheap to maintain unconditionally and keeps this the
   * single place "is the acceptable bar currently sustained" is ever
   * computed, read directly by finishAttempt's eligibility check rather
   * than re-evaluated there. */
  consecutiveAcceptableSeconds: number;
  /** Per severity-field-key: whether that field's "entering critical"
   * event has already been announced (so the engine only emits it once
   * per critical episode), generalizing the three old hardcoded booleans. */
  severityAnnounced: Record<string, boolean>;
  /** Per numeric-watch-field-key: whether that field's threshold-crossing
   * event has already been announced. */
  thresholdAnnounced: Record<string, boolean>;
  nextTimedEventIndex: number;
}

export interface PeakTrackingState {
  peakSeverityRank: number;
  /** Per numeric-watch-field-key (trackPeak: true): the maximum value
   * observed so far, generalizing the old fixed peakKafkaLagMessages. */
  peakValues: Record<string, number>;
  peakMonthlyCostUsd: number;
}

export interface SimulationState {
  simulationTimeMs: number;
  status: IncidentStatus;
  incidentStartedAtMs: number | null;
  resolvedAtMs: number | null;
  failedAtMs: number | null;

  controlValues: Record<string, ControlValue>;
  values: Record<string, StateValue>;
  componentHealth: Record<string, ComponentHealth>;

  /** Generic named boolean flags, set by timed events via `setTriggers`
   * and read by rule conditions via `triggerEquals`. Generalizes the old
   * fixed ProviderFlags { degraded, recovering }. */
  triggers: Record<string, boolean>;

  customerImpact: CustomerImpactState;
  cost: CostState;

  transitions: TransitionTrackingState;
  peaks: PeakTrackingState;

  numberOfConfigurationChanges: number;
  numberOfHarmfulChanges: number;
  numberOfBeneficialChanges: number;
}

export interface SimulationResult {
  state: SimulationState;
  events: SimulationEvent[];
}

// ─────────────────────────────────────────────────────────────────────────
// Raw scoring inputs — Phase 2+ will turn these into a 0-1000 score
// ─────────────────────────────────────────────────────────────────────────

export interface ScoringInputs {
  incidentStartedAtMs: number | null;
  resolvedAtMs: number | null;
  failedAtMs: number | null;

  totalTimeInCriticalMs: number;
  totalTimeInDegradedMs: number;

  revenueLossUsd: number;

  peakSeverityRank: number;

  numberOfConfigurationChanges: number;
  numberOfHarmfulChanges: number;
  numberOfBeneficialChanges: number;

  initialMonthlyInfrastructureCostUsd: number;
  finalMonthlyInfrastructureCostUsd: number;
  peakMonthlyInfrastructureCostUsd: number;

  /** Per numeric-watch-field-key: final and peak observed values,
   * generalizing the old fixed finalKafkaLagMessages/peakKafkaLagMessages. */
  finalNumericValues: Record<string, number>;
  peakNumericValues: Record<string, number>;

  /**
   * Final string-valued state.values entries (e.g. a scenario's own
   * tradeoff-tracking field like "orderingMode": "preserved"|"degraded").
   * Phase 6.1: added so scoring can reward a candidate_declared
   * scenario's acceptable-tier tradeoff generically, declaratively,
   * off real scenario state — never a scenario-specific measure, and
   * never inferred from completionTier (which only says which tier, not
   * why). Siblings finalNumericValues; populated the same way by
   * extractScoringInputs.
   */
  finalStringValues: Record<string, string>;
}
