"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ScenarioSimulationDefinition, StateValue } from "@incidentrank/simulator";
import type { CandidateUIDescriptor, ScenarioDefinition } from "@incidentrank/scenarios";
import { useIncidentAttempt } from "@/lib/use-incident-attempt";
import { formatUsd } from "@/lib/format";
import { IncidentHeader } from "@/app/incidents/payment-retry-storm/incident-header";
import { ArchitectureView } from "@/app/incidents/payment-retry-storm/architecture-view";
import { GenericMetricsPanel } from "./metrics-panel";
import { GenericComponentPanel } from "./component-panel";
import { GenericTimelinePanel } from "./timeline-panel";
import { GenericBriefingScreen } from "./briefing-screen";
import { GenericResultScreen } from "./result-screen";

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

interface GenericIncidentConsoleProps {
  scenario: ScenarioDefinition;
  simulation: ScenarioSimulationDefinition;
  candidateUI: CandidateUIDescriptor;
}

/**
 * The generic practice console for any built-in scenario — composes the
 * same Phase 5.1 Generic* components the assessment console already
 * uses, but driven by useIncidentAttempt's client-side local simulation
 * (practice mode) rather than the server-authoritative runtime
 * (assessment mode). This is what makes "adding scenario #21 requires no
 * new route/component" true: every built-in scenario's practice page
 * renders through this one component, parameterized only by its
 * ScenarioDefinition/simulation/candidateUI. Payment Retry Storm's own
 * hand-written IncidentConsole (apps/web/src/app/incidents/
 * payment-retry-storm/incident-console.tsx) is preserved unchanged
 * alongside this — not replaced — per the Phase 6 promotion contract.
 */
export function GenericIncidentConsole({
  scenario,
  simulation,
  candidateUI,
}: GenericIncidentConsoleProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const attempt = useIncidentAttempt(simulation, scenario.slug, Boolean(isSignedIn));
  const [selectedComponentId, setSelectedComponentId] = useState(
    candidateUI.components[0]?.id ?? "",
  );
  const previousValues = usePreviousValues(attempt.state.values);

  if (attempt.phase === "briefing") {
    return (
      <GenericBriefingScreen
        scenario={scenario}
        architecture={simulation.architecture}
        onAcknowledge={attempt.acknowledge}
        showSignInNudge={isLoaded && !isSignedIn}
      />
    );
  }

  if (attempt.phase === "result") {
    return (
      <GenericResultScreen
        state={attempt.state}
        actionGroups={attempt.actionGroups}
        descriptor={candidateUI}
        serverScore={attempt.serverScore}
        onTryAgain={attempt.resetAttempt}
        showSignInNudge={isLoaded && !isSignedIn}
      />
    );
  }

  const isTerminal = attempt.state.status === "resolved" || attempt.state.status === "failed";

  return (
    <main className="flex flex-1 flex-col">
      <IncidentHeader
        scenarioName={scenario.name}
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
    </main>
  );
}
