"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { StateValue } from "@incidentrank/simulator";
import {
  paymentRetryStorm,
  paymentRetryStormCandidateUI,
  paymentRetryStormSimulation,
} from "@incidentrank/scenarios";
import { useIncidentAttempt } from "@/lib/use-incident-attempt";
import { formatUsd } from "@/lib/format";
import { GenericResultScreen } from "@/components/scenario-console/result-screen";
import { BriefingScreen } from "./briefing-screen";
import { IncidentHeader } from "./incident-header";
import { ArchitectureView } from "./architecture-view";
import { MetricsPanel } from "./metrics-panel";
import { ComponentPanel } from "./component-panel";
import { TimelinePanel } from "./timeline-panel";

const DEFAULT_SELECTED_COMPONENT = "payment-service";

/**
 * Derives the previous metrics snapshot during render (React's documented
 * "adjusting state during rendering" pattern) rather than via a ref, which
 * is unsafe to read during render.
 */
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

export function IncidentConsole() {
  const { isSignedIn, isLoaded } = useAuth();
  const attempt = useIncidentAttempt(
    paymentRetryStormSimulation,
    paymentRetryStorm.slug,
    Boolean(isSignedIn),
  );
  const [selectedComponentId, setSelectedComponentId] = useState(
    DEFAULT_SELECTED_COMPONENT,
  );
  const previousValues = usePreviousValues(attempt.state.values);

  if (attempt.phase === "briefing") {
    return (
      <BriefingScreen
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
        descriptor={paymentRetryStormCandidateUI}
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
        scenarioName="Payment Retry Storm"
        status={attempt.state.status}
        simulationTimeMs={attempt.state.simulationTimeMs}
        incidentStartedAtMs={attempt.state.incidentStartedAtMs}
        incidentStarted={attempt.incidentStarted}
        incidentStartMs={attempt.incidentStartMs}
      />

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-background p-6">
          <ArchitectureView
            architecture={paymentRetryStormSimulation.architecture}
            componentHealth={attempt.state.componentHealth}
            selectedComponentId={selectedComponentId}
            onSelectComponent={setSelectedComponentId}
          />
        </section>

        <section className="bg-background p-6">
          <MetricsPanel
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
          <ComponentPanel
            componentId={selectedComponentId}
            controls={paymentRetryStormSimulation.controls}
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
          <TimelinePanel
            entries={attempt.timeline}
            actionGroups={attempt.actionGroups}
          />
        </section>
      </div>
    </main>
  );
}
