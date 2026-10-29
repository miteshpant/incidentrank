"use client";

import { useEffect, useState } from "react";
import type { CandidateUIDescriptor } from "@incidentrank/scenarios";
import { startAssessmentAttempt } from "@/lib/attempt-persistence";
import { StructuredDescription } from "@/components/scenario-console/structured-description";
import { AssessmentConsole } from "./assessment-console";
import { AlreadyCompleted } from "./already-completed";

interface AssessmentPreview {
  organizationName: string;
  assessmentName: string;
  assessmentStatus: "draft" | "active" | "closed";
  attemptId: string | null;
  attemptStatus: "in_progress" | "resolved" | "failed" | "abandoned" | null;
  scenarioName: string;
  scenarioDescription: string;
  scenarioDifficulty: string;
  scenarioEstimatedMinutes: number;
}

interface ScenarioPayload {
  scenarioSlug: string;
  candidateUI: CandidateUIDescriptor;
}

interface AssessmentLandingProps {
  assessmentId: string;
}

/**
 * Candidate assessment landing page. Shows org/assessment name, difficulty,
 * expected time, and the data-sharing disclosure required before Start —
 * deliberately does NOT expose scoring bands, success conditions, or the
 * intended solution. Once started (or if already started/completed on an
 * earlier visit), transitions straight into the live console/result, since
 * an assessment grants exactly one official attempt.
 *
 * Phase 5.1: no client-side resume reconstruction happens here anymore —
 * `AssessmentConsole` (via `useAssessmentRuntime`) bootstraps directly
 * from the server-authoritative runtime the moment it mounts, whether
 * this is a fresh start or a returning visit to an in-progress attempt.
 * This page's only job is identifying which attempt id to mount the
 * console against (fetched once, fresh or already-started) and fetching
 * the presentation-only scenario payload (name/architecture/controls/UI
 * descriptor — never rules, never scoring).
 */
export function AssessmentLanding({ assessmentId }: AssessmentLandingProps) {
  const [preview, setPreview] = useState<AssessmentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [startedAttemptId, setStartedAttemptId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [noticeAcknowledged, setNoticeAcknowledged] = useState(false);
  const [scenarioPayload, setScenarioPayload] = useState<ScenarioPayload | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  // The candidate-safe presentation descriptor — fetched once per
  // assessment, independent of attempt status, since it's needed both for
  // a fresh Start and for continuing an existing attempt. Never the
  // authored document, never scoring bands, never an executable
  // ScenarioSimulationDefinition — see
  // /api/assessment/[assessmentId]/scenario's own documentation.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assessment/${assessmentId}/scenario`)
      .then(async (response) => {
        const data = (await response.json()) as ScenarioPayload & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setScenarioError(data.error ?? "Failed to load scenario");
          return;
        }
        setScenarioPayload(data);
      })
      .catch(() => {
        if (!cancelled) setScenarioError("Failed to load scenario");
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assessment/${assessmentId}`)
      .then(async (response) => {
        const data = (await response.json()) as AssessmentPreview & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setPreviewError(data.error ?? "Assessment not found");
          return;
        }
        setPreview(data);

        if (data.attemptId && data.attemptStatus !== null) {
          // An attempt already exists (in progress or terminal) — mount
          // the console directly against it; useAssessmentRuntime
          // bootstraps from server-authoritative state either way.
          setStartedAttemptId(data.attemptId);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Failed to load assessment");
      });
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  const handleStart = async () => {
    setStartError(null);
    setIsStarting(true);

    // Phase 10D §23/§25: record the candidate's acknowledgment before
    // attempting to start — the start route itself still enforces this
    // server-side regardless (never relies on the UI checkbox alone),
    // but recording it first means a candidate who already acknowledged
    // on a prior visit never sees this step block them unnecessarily.
    const noticeResponse = await fetch(`/api/assessment/${assessmentId}/notice/accept`, {
      method: "POST",
    });
    if (!noticeResponse.ok) {
      setStartError("Could not record your acknowledgment. Please try again.");
      setIsStarting(false);
      return;
    }

    const result = await startAssessmentAttempt(assessmentId);
    if ("error" in result) {
      setStartError(result.error);
      setIsStarting(false);
      return;
    }
    // The candidate has already seen the briefing/disclosure on this
    // page — resume the server runtime clock immediately so the
    // console mounts straight into "active" rather than a redundant
    // paused state requiring a second click.
    await fetch(`/api/attempts/${result.attemptId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    }).finally(() => {
      setStartedAttemptId(result.attemptId);
    });
  };

  if (
    preview &&
    (preview.attemptStatus === "resolved" || preview.attemptStatus === "failed")
  ) {
    return <AlreadyCompleted status={preview.attemptStatus} />;
  }

  if (scenarioError) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-[#dc2626]">{scenarioError}</p>
      </main>
    );
  }

  if (startedAttemptId && !scenarioPayload) {
    // Scenario payload still loading — don't mount the console without it.
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading scenario…</p>
      </main>
    );
  }

  if (startedAttemptId && scenarioPayload) {
    return (
      <AssessmentConsole
        attemptId={startedAttemptId}
        scenarioName={preview?.scenarioName ?? scenarioPayload.scenarioSlug}
        scenarioDescription={preview?.scenarioDescription ?? ""}
        scenarioDifficulty={preview?.scenarioDifficulty ?? "intermediate"}
        scenarioEstimatedMinutes={preview?.scenarioEstimatedMinutes ?? 15}
        candidateUI={scenarioPayload.candidateUI}
      />
    );
  }

  if (previewError) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-[#dc2626]">{previewError}</p>
      </main>
    );
  }

  if (!preview) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }

  // Reached only when there is no existing (in-progress/resumable) attempt
  // for this candidate — closing an assessment blocks new starts, not an
  // existing legitimate attempt, which already returned above via
  // resumeSeed/startedAttemptId regardless of assessmentStatus.
  if (preview.assessmentStatus !== "active") {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <p className="text-sm text-muted">
          This assessment is not currently accepting new attempts.
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8">
        <span className="font-mono text-xs uppercase tracking-wide text-muted">
          {preview.organizationName}
        </span>

        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {preview.assessmentName}
        </h1>

        <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
          <div>
            <dt className="uppercase tracking-wide text-muted">Scenario</dt>
            <dd className="mt-1 text-foreground">{preview.scenarioName}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">Difficulty</dt>
            <dd className="mt-1 capitalize text-foreground">{preview.scenarioDifficulty}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">
              Expected Time
            </dt>
            <dd className="mt-1 text-foreground">~{preview.scenarioEstimatedMinutes} min</dd>
          </div>
        </dl>

        {preview.scenarioDescription && (
          <div className="mt-6">
            <StructuredDescription description={preview.scenarioDescription} />
          </div>
        )}

        <div className="mt-6 rounded-md border border-border bg-background p-4 text-sm text-muted">
          <p>
            You were invited by <strong className="text-foreground">{preview.organizationName}</strong> to
            complete this assessment. By starting, you acknowledge that:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your actions and reasoning during the assessment will be recorded.</li>
            <li>IncidentRank will calculate your results and performance metrics.</li>
            <li>{preview.organizationName} will be able to review your assessment report.</li>
            <li>
              This assessment is separate from your private practice profile and Engineer
              Rank — {preview.organizationName} will never see those.
            </li>
          </ul>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={noticeAcknowledged}
            onChange={(event) => setNoticeAcknowledged(event.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>I understand and agree to start this assessment under the terms above.</span>
        </label>

        {startError && <p className="mt-4 text-sm text-[#dc2626]">{startError}</p>}

        <button
          type="button"
          disabled={isStarting || !scenarioPayload || !noticeAcknowledged}
          onClick={handleStart}
          className="mt-8 w-full rounded-md border border-foreground bg-foreground px-4 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isStarting ? "Starting…" : "Start Assessment"}
        </button>
      </div>
    </main>
  );
}
