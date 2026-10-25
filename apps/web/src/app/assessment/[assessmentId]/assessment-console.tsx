"use client";

import { useState } from "react";
import type { StateValue } from "@incidentrank/simulator";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import { useAssessmentRuntime } from "@/lib/use-assessment-runtime";
import { formatUsd } from "@/lib/format";
import { IncidentHeader } from "@/app/incidents/payment-retry-storm/incident-header";
import { ArchitectureView } from "@/app/incidents/payment-retry-storm/architecture-view";
import { GenericMetricsPanel } from "@/components/scenario-console/metrics-panel";
import { GenericComponentPanel } from "@/components/scenario-console/component-panel";
import { GenericTimelinePanel } from "@/components/scenario-console/timeline-panel";
import { FinishIncidentDialog } from "@/components/scenario-console/finish-incident-dialog";
import { AssessmentResultScreen } from "./assessment-result-screen";
import { ResumeScreen } from "./resume-screen";

function usePreviousValues(
  values: Record<string, StateValue> | undefined,
): Record<string, StateValue> | null {
  const [tracked, setTracked] = useState<{
    current: Record<string, StateValue> | undefined;
    previous: Record<string, StateValue> | null;
  }>({ current: values, previous: null });

  if (tracked.current !== values) {
    setTracked({ current: values, previous: tracked.current ?? null });
    return tracked.current ?? null;
  }

  return tracked.previous;
}

interface AssessmentConsoleProps {
  attemptId: string;
  scenarioName: string;
  candidateUI: CandidateUIDescriptor;
}

/**
 * The candidate-facing assessment console (Phase 5.1: server-authoritative
 * runtime). Generic over any scenario (built-in or organization-authored)
 * — candidateUI is fetched by the parent (assessment-landing.tsx) from
 * the candidate-safe /api/assessment/[assessmentId]/scenario endpoint.
 * Unlike the pre-5.1 console, this component never receives a
 * ScenarioSimulationDefinition and never runs the simulator client-side —
 * useAssessmentRuntime talks exclusively to the server-authoritative
 * runtime endpoints, which return only a candidate-safe RuntimeView. Both
 * briefing/acknowledge and resume are modeled server-side now: the
 * attempt's runtime clock starts paused until the candidate's first visit
 * resumes it (see assessment-landing.tsx's start/resume flow).
 */
export function AssessmentConsole({ attemptId, scenarioName, candidateUI }: AssessmentConsoleProps) {
  const runtime = useAssessmentRuntime(attemptId);
  const [selectedComponentId, setSelectedComponentId] = useState(
    candidateUI.components[0]?.id ?? "",
  );
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const previousValues = usePreviousValues(runtime.view?.state.values);

  if (runtime.phase === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (runtime.phase === "error") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-[#dc2626]">
          {runtime.errorMessage ?? "Failed to load this assessment."}
        </p>
      </main>
    );
  }

  if (runtime.phase === "paused") {
    return (
      <ResumeScreen
        scenarioName={scenarioName}
        elapsedMs={runtime.view?.state.simulationTimeMs ?? 0}
        onResume={runtime.resumeClock}
      />
    );
  }

  if (!runtime.view) return null;

  if (runtime.phase === "result") {
    // Phase 7.1: the candidate never receives outcome/score/tier for an
    // assessment attempt — AssessmentResultScreen takes no evaluation-
    // derived props at all.
    return <AssessmentResultScreen />;
  }

  const isTerminal = runtime.view.status === "resolved" || runtime.view.status === "failed";
  const incidentStarted = runtime.view.state.transitions.nextTimedEventIndex > 0;
  // Finish Incident is universally available once the incident has
  // started and the attempt isn't already terminal — never gated on
  // completion mode (Phase 7.1 doctrine: the candidate must always be
  // able to declare Finish; the server alone decides whether that
  // declaration resolves).
  const canFinish = incidentStarted && !isTerminal;

  return (
    <main className="flex flex-1 flex-col">
      <IncidentHeader
        scenarioName={`${scenarioName} — Assessment`}
        status={runtime.view.status}
        simulationTimeMs={runtime.view.state.simulationTimeMs}
        incidentStartedAtMs={runtime.view.state.incidentStartedAtMs}
        incidentStarted={incidentStarted}
        incidentStartMs={runtime.view.incidentStartMs}
      />

      <div className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 gap-px bg-border lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-background p-6">
          <ArchitectureView
            architecture={runtime.view.architecture}
            componentHealth={runtime.view.state.componentHealth}
            selectedComponentId={selectedComponentId}
            onSelectComponent={setSelectedComponentId}
          />
        </section>

        <section className="bg-background p-6">
          <GenericMetricsPanel
            descriptor={candidateUI}
            values={runtime.view.state.values}
            previousValues={previousValues}
            revenueLossUsd={runtime.view.state.customerImpact.revenueLossUsd}
          />

          <div className="mt-6 rounded-md border border-border bg-surface p-4">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Current Infrastructure Cost
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {formatUsd(runtime.view.state.cost.currentMonthlyCostUsd)}/mo
            </p>
          </div>
        </section>

        <section className="bg-background p-6">
          <GenericComponentPanel
            componentId={selectedComponentId}
            descriptor={candidateUI}
            controls={runtime.view.controls}
            state={runtime.view.state}
            pendingControlValues={runtime.pendingControlValues}
            hasPendingChanges={runtime.hasPendingChanges}
            disabled={isTerminal}
            incidentStarted={incidentStarted}
            onChangePendingValue={runtime.setPendingValue}
            onApplyChanges={runtime.applyChanges}
          />

          <div className="mt-6 border-t border-border pt-6">
            <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
              Candidate Judgment
            </p>
            <p className="mt-1 text-sm text-muted">
              When you believe the system is sufficiently stabilized, declare
              the incident finished.
            </p>
            <button
              type="button"
              onClick={() => setFinishDialogOpen(true)}
              disabled={!canFinish}
              className="mt-3 rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Finish Incident
            </button>
            {runtime.finishError && !finishDialogOpen && (
              <p className="mt-2 text-sm text-[#dc2626]" role="alert">
                {runtime.finishError}
              </p>
            )}
          </div>
        </section>

        <section className="bg-background p-6">
          <GenericTimelinePanel
            entries={runtime.timeline}
            actionGroups={runtime.actionGroups}
            descriptor={candidateUI}
          />
        </section>
      </div>

      <FinishIncidentDialog
        open={finishDialogOpen}
        finishing={runtime.finishing}
        finishError={runtime.finishError}
        onCancel={() => setFinishDialogOpen(false)}
        onConfirm={(note) => {
          runtime.finishIncident(note);
        }}
      />
    </main>
  );
}
