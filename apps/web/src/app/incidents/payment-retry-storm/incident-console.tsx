"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { StateValue } from "@incidentrank/simulator";
import {
  paymentRetryStorm,
  paymentRetryStormCandidateUI,
  paymentRetryStormSimulation,
} from "@incidentrank/scenarios";
import { useIncidentAttempt, type ResumeSeed } from "@/lib/use-incident-attempt";
import { findActiveAttempt, fetchResumeSeed } from "@/lib/attempt-persistence";
import { formatUsd } from "@/lib/format";
import { GenericResultScreen } from "@/components/scenario-console/result-screen";
import { GenericResumeScreen } from "@/components/scenario-console/resume-screen";
import { FinishIncidentDialog } from "@/components/scenario-console/finish-incident-dialog";
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
  const [fetchedSeed, setFetchedSeed] = useState<{ seed: ResumeSeed | null } | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    findActiveAttempt(paymentRetryStorm.slug).then((attemptId) => {
      if (!attemptId) {
        if (!cancelled) setFetchedSeed({ seed: null });
        return;
      }
      fetchResumeSeed(attemptId).then((seed) => {
        if (!cancelled) setFetchedSeed({ seed });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (isSignedIn && fetchedSeed === null) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  return <IncidentConsoleActive resumeSeed={fetchedSeed?.seed ?? null} />;
}

function IncidentConsoleActive({ resumeSeed }: { resumeSeed: ResumeSeed | null }) {
  const { isSignedIn, isLoaded } = useAuth();
  const attempt = useIncidentAttempt(
    paymentRetryStormSimulation,
    paymentRetryStorm.slug,
    Boolean(isSignedIn),
    null,
    resumeSeed,
  );
  const [selectedComponentId, setSelectedComponentId] = useState(
    DEFAULT_SELECTED_COMPONENT,
  );
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const previousValues = usePreviousValues(attempt.state.values);
  const [challengeLink, setChallengeLink] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);

  // docs/implementation_plan/phase-challege-version.md §5/§6 — mirrors
  // generic-incident-console.tsx's identical handler. Payment Retry
  // Storm is a practice-only path, same eligibility as every other
  // built-in scenario.
  function handleChallengeAnother() {
    if (!attempt.attemptId) return;
    setChallengeError(null);
    setCreatingChallenge(true);
    fetch("/api/challenges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId: attempt.attemptId }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as { token?: string; error?: string };
        if (!response.ok || !data.token) {
          setChallengeError(data.error ?? "Failed to create a challenge link.");
          setCreatingChallenge(false);
          return;
        }
        setChallengeLink(`${window.location.origin}/challenge/${data.token}`);
        setCreatingChallenge(false);
      })
      .catch(() => {
        setChallengeError("Failed to create a challenge link.");
        setCreatingChallenge(false);
      });
  }

  if (attempt.phase === "paused") {
    return (
      <GenericResumeScreen
        scenarioName="Payment Retry Storm"
        elapsedMs={attempt.state.simulationTimeMs}
        onResume={attempt.resumeClock}
      />
    );
  }

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
      <>
        <GenericResultScreen
          state={attempt.state}
          actionGroups={attempt.actionGroups}
          descriptor={paymentRetryStormCandidateUI}
          serverScore={attempt.serverScore}
          serverRecoveryTimeMs={attempt.serverRecoveryTimeMs}
          scoringError={attempt.scoringError}
          retryScoring={attempt.retryScoring}
          outcome={attempt.outcome}
          completionTier={attempt.completionTier}
          onTryAgain={attempt.resetAttempt}
          showSignInNudge={isLoaded && !isSignedIn}
          attemptId={attempt.attemptId}
          onChallengeAnother={
            isSignedIn && attempt.attemptId ? handleChallengeAnother : undefined
          }
        />
        {(challengeLink || challengeError || creatingChallenge) && (
          <div className="mx-auto mb-10 w-full max-w-2xl px-6">
            <div className="rounded-md border border-border bg-surface p-4">
              {creatingChallenge && <p className="text-sm text-muted">Creating challenge link…</p>}
              {challengeError && <p className="text-sm text-[#dc2626]">{challengeError}</p>}
              {challengeLink && (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
                    Share this link
                  </p>
                  <p className="mt-1 break-all font-mono text-sm">{challengeLink}</p>
                </>
              )}
            </div>
          </div>
        )}
      </>
    );
  }

  const isTerminal = attempt.state.status === "resolved" || attempt.state.status === "failed";
  const canFinish =
    attempt.completionMode === "candidate_declared" &&
    attempt.phase === "active" &&
    attempt.incidentStarted &&
    !isTerminal;

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

          {attempt.completionMode === "candidate_declared" && (
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
              {attempt.finishError && !finishDialogOpen && (
                <p className="mt-2 text-sm text-[#dc2626]" role="alert">
                  {attempt.finishError}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="bg-background p-6">
          <TimelinePanel
            entries={attempt.timeline}
            actionGroups={attempt.actionGroups}
          />
        </section>
      </div>

      {attempt.completionMode === "candidate_declared" && (
        <FinishIncidentDialog
          open={finishDialogOpen}
          finishing={attempt.finishing}
          finishError={attempt.finishError}
          onCancel={() => setFinishDialogOpen(false)}
          onConfirm={(note) => {
            void attempt.finishIncident(note);
          }}
        />
      )}
    </main>
  );
}
