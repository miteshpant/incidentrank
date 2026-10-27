import { formatElapsed } from "@/lib/format";

interface GenericResumeScreenProps {
  scenarioName: string;
  elapsedMs: number;
  onResume: () => void;
}

/**
 * Shown when a signed-in candidate returns to a practice incident that
 * is already in progress (GenericIncidentConsole's pre-mount resume
 * lookup found an in-progress attempt) instead of silently restarting
 * the clock or, worse, silently starting a second, orphaning attempt —
 * mirrors apps/web/src/app/assessment/[assessmentId]/resume-screen.tsx's
 * same Phase 4.1 principle for practice: "Do not automatically restart
 * the timer before the candidate explicitly resumes."
 */
export function GenericResumeScreen({
  scenarioName,
  elapsedMs,
  onResume,
}: GenericResumeScreenProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8 text-center">
        <span className="font-mono text-xs uppercase tracking-wide text-muted">
          Incident In Progress
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{scenarioName}</h1>
        <p className="mt-4 text-sm text-muted">Your incident is currently paused at</p>
        <p className="mt-1 font-mono text-3xl font-semibold tracking-tight">
          {formatElapsed(elapsedMs)}
        </p>
        <p className="mt-6 text-xs text-muted">
          Your previous actions and reasoning have been restored.
        </p>
        <button
          type="button"
          onClick={onResume}
          className="mt-8 w-full rounded-md border border-foreground bg-foreground px-4 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Resume Incident
        </button>
      </div>
    </main>
  );
}
