// ─────────────────────────────────────────────────────────────────────────
// Candidate-facing display descriptors — shared shape between built-in
// (incidentrank-owned) scenarios and organization-authored scenarios, so
// the candidate console can render ANY scenario generically instead of
// hardcoding Payment Retry Storm's metric/control labels. This is
// candidate-safe display metadata only: labels, formats, and which
// architecture node a control belongs to. It carries no behavior — no
// rules, no thresholds, no scoring — all of which stay out of this shape
// entirely (packages/simulator's ScenarioSimulationDefinition remains the
// only thing driving engine behavior).
// ─────────────────────────────────────────────────────────────────────────

export type CandidateMetricFormat =
  | "number"
  | "percentage"
  | "duration"
  | "currency"
  | "status";

export interface CandidateMetricDescriptor {
  key: string;
  label: string;
  sourceStateKey: string;
  format: CandidateMetricFormat;
}

export interface CandidateControlDescriptor {
  key: string;
  label: string;
  componentId: string;
  /** Pre-formatted display string per allowed value, keyed by String(value). */
  valueLabels?: Record<string, string>;
}

export interface CandidateComponentDescriptor {
  id: string;
  label: string;
}

export interface CandidateUIDescriptor {
  metrics: CandidateMetricDescriptor[];
  controls: CandidateControlDescriptor[];
  components: CandidateComponentDescriptor[];
}
