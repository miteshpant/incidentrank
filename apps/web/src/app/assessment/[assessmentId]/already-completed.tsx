import Link from "next/link";

interface AlreadyCompletedProps {
  status: "resolved" | "failed";
}

/**
 * Shown when a candidate returns to an assessment whose one official
 * attempt is already terminal. Phase 4 does not implement attempt
 * resume/reconnect (documented limitation, consistent with Phase 3's
 * existing in-browser-only simulation state) — rather than silently
 * restarting a fresh simulation, this screen makes clear the attempt is
 * already final and does not offer a way to replay it as the candidate.
 * The full score breakdown and timeline remain available to the hiring
 * team via the organization's candidate result view.
 */
export function AlreadyCompleted({ status }: AlreadyCompletedProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8 text-center">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
          Assessment Complete
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {status === "resolved" ? "Incident Resolved" : "Incident Failed"}
        </h1>
        <p className="mt-4 text-sm text-muted">
          You have already completed this assessment. This was your one
          official attempt — your result has been shared with the
          organization that invited you.
        </p>
        <div className="mt-8">
          <Link
            href="/"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Back to IncidentRank
          </Link>
        </div>
      </div>
    </main>
  );
}
