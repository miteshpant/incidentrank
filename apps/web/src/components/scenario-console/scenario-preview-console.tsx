"use client";

import { useEffect, useState } from "react";
import type { ScenarioSimulationDefinition, StateValue } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import { useIncidentAttempt, type IncidentAttempt } from "@/lib/use-incident-attempt";
import { formatUsd } from "@/lib/format";
import { IncidentHeader } from "@/app/incidents/payment-retry-storm/incident-header";
import { ArchitectureView } from "@/app/incidents/payment-retry-storm/architecture-view";
import { GenericMetricsPanel } from "./metrics-panel";
import { GenericComponentPanel } from "./component-panel";
import { GenericTimelinePanel } from "./timeline-panel";

function usePreviousValues(
  values: Record<string, StateValue>,
): Record<string, StateValue> | null {
  const [tracked, setTracked] = useState<{
    current: Record<string, StateValue>;
    previous: Record<string, StateValue> | null;
  }>({ current: values, previous: null });

  if (tracked.current !== values) {
    setTracked({ current: values, previous: tracked.current });
    return tracked.current;
  }

  return tracked.previous;
}

export interface ScenarioPreviewConsoleProps {
  scenarioSlug: string;
  scenarioName: string;
  simulation: ScenarioSimulationDefinition;
  candidateUI: CandidateUIDescriptor;
  /** Shown in the banner above the console — lets callers distinguish an author draft preview from a hiring-admin assessment preview. */
  bannerLabel?: string;
  /**
   * Optional extra content rendered below the console, with access to the
   * same live `attempt` state this component already holds — e.g. the
   * scenario-author preview's own matched-rule/score debug panel. Exists
   * so a caller never needs a second useIncidentAttempt call (which would
   * create a second, independently-diverging simulation instance).
   */
  renderBelow?: (attempt: IncidentAttempt) => React.ReactNode;
}

/**
 * The scoring-agnostic candidate-console preview — exactly what a real
 * candidate sees (architecture view, metrics, controls, timeline), run
 * with isSignedIn: false via useIncidentAttempt (the same zero-
 * persistence mechanism anonymous practice play uses: no attempt row, no
 * scoring, no leaderboard impact). Deliberately has no scoring/debug
 * panel of its own — callers that need one (e.g. the scenario-author
 * preview) render it separately below this component, keeping this piece
 * reusable for contexts (like an org admin evaluating a scenario for an
 * assessment) that should never see internal scoring-rule details.
 */
export function ScenarioPreviewConsole({
  scenarioSlug,
  scenarioName,
  simulation,
  candidateUI,
  bannerLabel = "Preview — not scored, not persisted, not visible to candidates",
  renderBelow,
}: ScenarioPreviewConsoleProps) {
  const attempt = useIncidentAttempt(simulation, scenarioSlug, false);
  const [selectedComponentId, setSelectedComponentId] = useState(
    candidateUI.components[0]?.id ?? "",
  );
  const previousValues = usePreviousValues(attempt.state.values);

  const { acknowledge, phase } = attempt;
  useEffect(() => {
    if (phase === "briefing") acknowledge();
  }, [phase, acknowledge]);

  if (attempt.phase === "briefing") return null;

  const isTerminal = attempt.state.status === "resolved" || attempt.state.status === "failed";

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-[#d97706]/40 bg-[#d97706]/10 px-6 py-2 text-center font-mono text-xs uppercase tracking-wide text-[#d97706]">
        {bannerLabel}
      </div>

      <IncidentHeader
        scenarioName={`${scenarioName} — Preview`}
        status={attempt.state.status}
        simulationTimeMs={attempt.state.simulationTimeMs}
        incidentStartedAtMs={attempt.state.incidentStartedAtMs}
        incidentStarted={attempt.incidentStarted}
        incidentStartMs={attempt.incidentStartMs}
      />

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-background p-6">
          <ArchitectureView
            architecture={simulation.architecture}
            componentHealth={attempt.state.componentHealth}
            selectedComponentId={selectedComponentId}
            onSelectComponent={setSelectedComponentId}
          />
        </section>

        <section className="bg-background p-6">
          <GenericMetricsPanel
            descriptor={candidateUI}
            values={attempt.state.values}
            previousValues={previousValues}
            revenueLossUsd={attempt.state.customerImpact.revenueLossUsd}
          />
          <div className="mt-6 rounded-md border border-border bg-surface p-4">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Current Infrastructure Cost
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {formatUsd(attempt.state.cost.currentMonthlyCostUsd)}/mo
            </p>
          </div>
        </section>

        <section className="bg-background p-6">
          <GenericComponentPanel
            componentId={selectedComponentId}
            descriptor={candidateUI}
            controls={simulation.controls}
            state={attempt.state}
            pendingControlValues={attempt.pendingControlValues}
            hasPendingChanges={attempt.hasPendingChanges}
            disabled={isTerminal}
            incidentStarted={attempt.incidentStarted}
            onChangePendingValue={attempt.setPendingValue}
            onApplyChanges={attempt.applyChanges}
          />
        </section>

        <section className="bg-background p-6">
          <GenericTimelinePanel
            entries={attempt.timeline}
            actionGroups={attempt.actionGroups}
            descriptor={candidateUI}
          />
        </section>
      </div>

      {renderBelow && (
        <div className="mx-auto w-full max-w-6xl p-6">{renderBelow(attempt)}</div>
      )}
    </div>
  );
}
