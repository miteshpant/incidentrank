"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { ScenarioSimulationDefinition, StateValue } from "@incidentrank/simulator";
import type { CandidateUIDescriptor, PublicScenarioMetadata } from "@incidentrank/scenarios";
import { useIncidentAttempt, type ResumeSeed } from "@/lib/use-incident-attempt";
import { findActiveAttempt, fetchResumeSeed } from "@/lib/attempt-persistence";
import { trackEvent } from "@/lib/analytics";
import { formatUsd } from "@/lib/format";
import { IncidentHeader } from "@/app/incidents/payment-retry-storm/incident-header";
import { ArchitectureView } from "@/app/incidents/payment-retry-storm/architecture-view";
import { GenericMetricsPanel } from "./metrics-panel";
import { GenericComponentPanel } from "./component-panel";
import { GenericTimelinePanel } from "./timeline-panel";
import { GenericBriefingScreen } from "./briefing-screen";
import { GenericResultScreen } from "./result-screen";
import { GenericResumeScreen } from "./resume-screen";
import { FinishIncidentDialog } from "./finish-incident-dialog";
import { IncidentBrief } from "./incident-brief";
import { HowToRespond } from "./how-to-respond";

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
  /** Public-safe projection only — the full ScenarioDefinition (and its
   * private `.simulation`) is never passed into this or any client
   * component as a prop; a prop would be serialized into the page's RSC
   * payload for every visitor, before any Acknowledge click
   * (docs/implementation_plan/seopphase.md §1/§15). The real
   * ScenarioSimulationDefinition is instead fetched client-side from
   * GET /api/incidents/[slug]/simulation, gated by the same server-side
   * access check the page itself already enforces. */
  scenario: PublicScenarioMetadata;
  candidateUI: CandidateUIDescriptor;
}

/**
 * The generic practice console for any built-in scenario — composes the
 * same Phase 5.1 Generic* components the assessment console already
 * uses, but driven by useIncidentAttempt's client-side local simulation
 * (practice mode) rather than the server-authoritative runtime
 * (assessment mode). This is what makes "adding scenario #21 requires no
 * new route/component" true: every built-in scenario's practice page
 * renders through this one component, parameterized only by its public
 * scenario metadata/candidateUI plus a lazily-fetched simulation config.
 * Payment Retry Storm's own hand-written IncidentConsole
 * (apps/web/src/app/incidents/payment-retry-storm/incident-console.tsx)
 * is preserved unchanged alongside this — not replaced — per the Phase 6
 * promotion contract.
 *
 * Phase 7.3: before mounting useIncidentAttempt, checks whether the
 * signed-in candidate already has an in-progress practice attempt for
 * this exact scenario and, if so, fetches a full ResumeSeed so the hook
 * never starts a fresh briefing over an abandoned-looking active
 * incident — useIncidentAttempt only ever adopts a resumeSeed on its
 * very first render, so this lookup must complete (or definitively find
 * nothing) before the hook mounts, not in an effect afterward. Anonymous
 * candidates skip the lookup entirely (no persisted attempt exists for
 * them to resume).
 *
 * The real ScenarioSimulationDefinition is fetched alongside that same
 * lookup — useIncidentAttempt needs the full simulation object the
 * instant it mounts, for both the fresh-briefing path and (especially)
 * the resume path, which never passes through an Acknowledge click at
 * all. Fetching unconditionally here (rather than only after
 * Acknowledge) covers both paths uniformly without special-casing
 * resume, and still closes the leak: a crawler or anonymous visitor who
 * never executes client JS never issues this fetch at all, so the
 * private payload never appears in server-rendered HTML or the RSC
 * payload — only in a same-origin API response to an actual browser.
 */
export function GenericIncidentConsole(props: GenericIncidentConsoleProps) {
  const { isSignedIn, isLoaded } = useAuth();
  const [fetchedSeed, setFetchedSeed] = useState<{ seed: ResumeSeed | null } | null>(null);
  const [fetchedSimulation, setFetchedSimulation] = useState<{
    simulation: ScenarioSimulationDefinition | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    fetch(`/api/incidents/${props.scenario.slug}/simulation`)
      .then(async (response) => {
        if (!response.ok) {
          if (!cancelled) setFetchedSimulation({ simulation: null, error: true });
          return;
        }
        const data = (await response.json()) as { simulation: ScenarioSimulationDefinition };
        if (!cancelled) setFetchedSimulation({ simulation: data.simulation, error: false });
      })
      .catch(() => {
        if (!cancelled) setFetchedSimulation({ simulation: null, error: true });
      });

    if (!isSignedIn) {
      // No persisted attempt can exist for a signed-out candidate — skip
      // the lookup, but still resolve asynchronously (never a synchronous
      // setState call inside the effect body) to match the signed-in
      // branch's own async resolution shape.
      Promise.resolve().then(() => {
        if (!cancelled) setFetchedSeed({ seed: null });
      });
      return () => {
        cancelled = true;
      };
    }

    findActiveAttempt(props.scenario.slug).then((attemptId) => {
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
    // Scenario slug is static for the lifetime of this component; only
    // auth readiness should re-trigger the lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || fetchedSeed === null || fetchedSimulation === null) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  if (fetchedSimulation.error || !fetchedSimulation.simulation) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">
          This incident couldn&apos;t be loaded. Refresh to try again.
        </p>
      </main>
    );
  }

  return (
    <GenericIncidentConsoleActive
      {...props}
      simulation={fetchedSimulation.simulation}
      resumeSeed={fetchedSeed.seed}
    />
  );
}

function GenericIncidentConsoleActive({
  scenario,
  simulation,
  candidateUI,
  resumeSeed,
}: GenericIncidentConsoleProps & {
  simulation: ScenarioSimulationDefinition;
  resumeSeed: ResumeSeed | null;
}) {
  const { isSignedIn, isLoaded } = useAuth();
  const attempt = useIncidentAttempt(
    simulation,
    scenario.slug,
    Boolean(isSignedIn),
    null,
    resumeSeed,
  );
  const [selectedComponentId, setSelectedComponentId] = useState(
    candidateUI.components[0]?.id ?? "",
  );
  const [finishDialogOpen, setFinishDialogOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  // Expanded by default on first reaching the solving screen (docs/
  // implementation_plan/incidentrank-incident-solving-screen-ux-reorder.md
  // §2). Never permanently hides — the trigger button still reopens it.
  const [howToRespondOpen, setHowToRespondOpen] = useState(true);
  const previousValues = usePreviousValues(attempt.state.values);
  const [challengeLink, setChallengeLink] = useState<string | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [creatingChallenge, setCreatingChallenge] = useState(false);

  // docs/implementation_plan/phase-challege-version.md §5/§6 — signed-in
  // only (§6's confirmed decision: anonymous users see the sign-in modal
  // instead, same as every other signed-in-only action on this screen).
  // Never passed to GenericResultScreen at all for a signed-out attempt
  // (no persisted attemptId exists to reference), matching the existing
  // showSignInNudge gate already used for View Attempt History.
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
        scenarioName={scenario.name}
        elapsedMs={attempt.state.simulationTimeMs}
        onResume={attempt.resumeClock}
      />
    );
  }

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
      <>
        <GenericResultScreen
          state={attempt.state}
          actionGroups={attempt.actionGroups}
          descriptor={candidateUI}
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

  // The only local engine transition that can end an "active" phase is
  // state.status==="failed" — success never auto-writes, for any
  // scenario (see tick.ts's completion-sustain-tracking comment) — so
  // checking status alone here remains accurate for disabling controls.
  // Finish Incident is universally available once the incident has
  // started and the attempt isn't already terminal; it is never gated
  // on completion mode (Phase 7.1 doctrine: the candidate must always be
  // able to declare Finish, early or late — the server alone decides
  // whether that declaration resolves).
  const isTerminal = attempt.state.status === "resolved" || attempt.state.status === "failed";
  const canFinish = attempt.phase === "active" && attempt.incidentStarted && !isTerminal;

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

      <div className="mx-auto flex w-full max-w-6xl justify-end gap-2 px-6 pt-4">
        <button
          type="button"
          onClick={() => setHowToRespondOpen(true)}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
        >
          How to Respond
        </button>
        <button
          type="button"
          onClick={() => setBriefOpen(true)}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs transition-colors hover:border-foreground/40"
        >
          Incident Brief
        </button>
      </div>

      <HowToRespond open={howToRespondOpen} onClose={() => setHowToRespondOpen(false)} />

      <IncidentBrief
        scenario={scenario}
        architecture={simulation.architecture}
        open={briefOpen}
        onClose={() => setBriefOpen(false)}
      />

      {/* Architecture directly above the action controls (left column),
          so actions begin right under System Architecture — the one
          layout change this task makes. Metrics above Timeline (right
          column), unchanged. */}
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:divide-x lg:divide-border">
        <div className="flex flex-col divide-y divide-border bg-background">
          <section className="p-6">
            <ArchitectureView
              architecture={simulation.architecture}
              componentHealth={attempt.state.componentHealth}
              selectedComponentId={selectedComponentId}
              onSelectComponent={setSelectedComponentId}
            />
          </section>

          <section className="p-6">
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
                onClick={() => {
                  trackEvent("finish_clicked", {
                    scenarioSlug: scenario.slug,
                    practiceOrAssessment: "practice",
                  });
                  // How to Respond defaults open on first reaching this
                  // screen — close it (and Incident Brief, if open) so it
                  // never competes with the Finish confirmation dialog
                  // for focus/role="dialog" uniqueness.
                  setHowToRespondOpen(false);
                  setBriefOpen(false);
                  setFinishDialogOpen(true);
                }}
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
          </section>
        </div>

        <div className="flex flex-col divide-y divide-border bg-background">
          <section className="p-6">
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

          <section className="p-6">
            <GenericTimelinePanel
              entries={attempt.timeline}
              actionGroups={attempt.actionGroups}
              descriptor={candidateUI}
            />
          </section>
        </div>
      </div>

      <FinishIncidentDialog
        open={finishDialogOpen}
        finishing={attempt.finishing}
        finishError={attempt.finishError}
        onCancel={() => setFinishDialogOpen(false)}
        onConfirm={(note) => {
          // Stays open on failure so the candidate sees finishError and
          // can retry or cancel — only closes once the attempt actually
          // reaches a terminal phase (the console then unmounts this
          // dialog entirely by rendering the result screen instead).
          void attempt.finishIncident(note);
        }}
      />
    </main>
  );
}
