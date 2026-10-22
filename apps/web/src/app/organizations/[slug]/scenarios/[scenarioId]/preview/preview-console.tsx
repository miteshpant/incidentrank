"use client";

import { useEffect, useState } from "react";
import type { ScenarioSimulationDefinition, StateValue } from "@incidentrank/simulator";
import { extractScoringInputs } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import { scoreAuthoredAttempt, type AuthoredScoringConfig } from "@incidentrank/scenarios/authoring";
import { useIncidentAttempt } from "@/lib/use-incident-attempt";
import { formatUsd } from "@/lib/format";
import { IncidentHeader } from "@/app/incidents/payment-retry-storm/incident-header";
import { ArchitectureView } from "@/app/incidents/payment-retry-storm/architecture-view";
import { GenericMetricsPanel } from "@/components/scenario-console/metrics-panel";
import { GenericComponentPanel } from "@/components/scenario-console/component-panel";
import { GenericTimelinePanel } from "@/components/scenario-console/timeline-panel";

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

interface PreviewConsoleProps {
  scenarioSlug: string;
  scenarioName: string;
  simulation: ScenarioSimulationDefinition;
  candidateUI: CandidateUIDescriptor;
  authoredScoring: AuthoredScoringConfig;
}

/**
 * Author-only preview/test-run console (Phase 5 spec). Runs the exact
 * same candidate-facing UI as a real assessment, but with isSignedIn:
 * false passed to useIncidentAttempt — this is the same mechanism
 * anonymous practice play already uses to guarantee zero persistence: no
 * attempt row is ever created, nothing reaches the leaderboard, nothing
 * creates candidate history. A clearly-labeled author/debug panel below
 * the normal UI shows the matched rule and resulting authored scoring
 * breakdown once the scenario reaches a terminal state — never shown to
 * candidates.
 */
export function PreviewConsole({
  scenarioSlug,
  scenarioName,
  simulation,
  candidateUI,
  authoredScoring,
}: PreviewConsoleProps) {
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
  const previewScore = isTerminal
    ? scoreAuthoredAttempt(authoredScoring, extractScoringInputs(simulation, attempt.state))
    : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-[#d97706]/40 bg-[#d97706]/10 px-6 py-2 text-center font-mono text-xs uppercase tracking-wide text-[#d97706]">
        Author Preview — not scored, not persisted, not visible to candidates
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

      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="rounded-md border border-[#d97706]/40 bg-[#d97706]/5 p-4">
          <p className="font-mono text-[10px] uppercase tracking-wide text-[#d97706]">
            Author Debug — matched rule &amp; effects
          </p>
          <p className="mt-2 text-sm">
            Matched rule id: <span className="font-mono">{attempt.state.transitions.matchedRuleId ?? "(none)"}</span>
          </p>
          <p className="mt-1 text-sm">
            Incident state: <span className="font-mono">{attempt.state.transitions.incidentState}</span>
          </p>
          {previewScore && (
            <>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-wide text-[#d97706]">
                Preview Score (not final — recomputed server-side on real attempts)
              </p>
              <p className="mt-1 text-sm">
                Total: {previewScore.total} / 1000
              </p>
              <dl className="mt-2 flex flex-col gap-1">
                {Object.entries(previewScore.breakdown).map(([dimension, points]) => (
                  <div key={dimension} className="flex justify-between text-xs">
                    <dt className="text-muted">{dimension}</dt>
                    <dd className="font-mono">{points}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
