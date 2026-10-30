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
  /**
   * Phase 10F — what this metric represents about the incident (root
   * cause / contributing factor / downstream symptom / context / noise).
   * Author-only: never gates visibility, never shown to the candidate
   * during an active attempt, never read by the simulation engine.
   * Consumed only by the post-incident review narrative
   * (buildIncidentNarrative) and optionally referenced by an author
   * writing their own explicit scoring measure. Works identically for
   * built-in and organization-authored scenarios, since both resolve to
   * this same CandidateUIDescriptor shape.
   */
  roleInIncident?: "root_cause" | "contributing_factor" | "downstream_symptom" | "context" | "noise";
}

export interface CandidateControlDescriptor {
  key: string;
  label: string;
  componentId: string;
  /** Pre-formatted display string per allowed value, keyed by String(value). */
  valueLabels?: Record<string, string>;
  /** Phase 10F — purely descriptive UI label (see AuthoredControl.kind). Defaults to "remediation" for every control authored before this phase. Never consulted by any engine mechanics. */
  kind?: "remediation" | "investigation";
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
