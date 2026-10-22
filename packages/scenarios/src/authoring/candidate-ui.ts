import type { CandidateUIDescriptor } from "../candidate-ui";
import type { AuthoredScenario } from "./schema";

/**
 * Derives the candidate-facing display descriptor from an authored
 * scenario's metrics/controls/architecture sections — the same generic
 * MetricsPanel/ComponentPanel that renders Payment Retry Storm also
 * renders any organization-authored scenario through this. Carries no
 * behavior: labels and formats only, never rules/conditions/scoring.
 */
export function authoredScenarioToCandidateUI(authored: AuthoredScenario): CandidateUIDescriptor {
  return {
    metrics: authored.metrics.map((metric) => ({
      key: metric.key,
      label: metric.label,
      sourceStateKey: metric.sourceStateKey,
      format: metric.format,
    })),
    controls: authored.controls.map((control) => ({
      key: control.key,
      label: control.label,
      componentId: control.componentId,
    })),
    components: authored.architecture.nodes.map((node) => ({
      id: node.id,
      label: node.label,
    })),
  };
}
