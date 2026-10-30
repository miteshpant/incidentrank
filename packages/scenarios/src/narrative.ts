import type { StateValue } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "./candidate-ui";

export interface IncidentNarrativeEntry {
  label: string;
  /** The metric's live value at the point the narrative was built (final state, or whatever state the caller passes in). */
  value: StateValue | undefined;
}

export interface IncidentNarrative {
  rootCause: IncidentNarrativeEntry[];
  contributingFactors: IncidentNarrativeEntry[];
  observedEffects: IncidentNarrativeEntry[];
  context: IncidentNarrativeEntry[];
}

/**
 * Phase 10F post-incident narrative — pure data assembly, no inference,
 * no LLM call. Groups a scenario's own CandidateUIDescriptor.metrics by
 * their author-tagged roleInIncident ("root_cause" is the incident's
 * actual root cause, "downstream_symptom" is an observed effect of it,
 * etc — see schema.ts's AuthoredRoleInIncident doc comment) and reads
 * each metric's live value out of `values` by its sourceStateKey.
 * Metrics tagged "noise" are deliberately never surfaced here — they
 * exist in the scenario to be a plausible distraction during the
 * attempt, not to be explained afterward. Metrics with no
 * roleInIncident tag at all (every scenario authored before Phase 10F)
 * are silently excluded from every group — returns all-empty arrays for
 * such a scenario, and callers should render nothing in that case rather
 * than an empty "Root cause:" section header.
 */
export function buildIncidentNarrative(
  candidateUI: CandidateUIDescriptor,
  values: Record<string, StateValue>,
): IncidentNarrative {
  const narrative: IncidentNarrative = {
    rootCause: [],
    contributingFactors: [],
    observedEffects: [],
    context: [],
  };

  for (const metric of candidateUI.metrics) {
    const entry: IncidentNarrativeEntry = {
      label: metric.label,
      value: values[metric.sourceStateKey],
    };

    switch (metric.roleInIncident) {
      case "root_cause":
        narrative.rootCause.push(entry);
        break;
      case "contributing_factor":
        narrative.contributingFactors.push(entry);
        break;
      case "downstream_symptom":
        narrative.observedEffects.push(entry);
        break;
      case "context":
        narrative.context.push(entry);
        break;
      case "noise":
      case undefined:
        break;
    }
  }

  return narrative;
}

/** Whether buildIncidentNarrative found anything worth rendering — every pre-Phase-10F scenario (no roleInIncident tags anywhere) returns false here. */
export function hasIncidentNarrative(narrative: IncidentNarrative): boolean {
  return (
    narrative.rootCause.length > 0 ||
    narrative.contributingFactors.length > 0 ||
    narrative.observedEffects.length > 0 ||
    narrative.context.length > 0
  );
}
