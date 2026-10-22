"use client";

import { SignInButton } from "@clerk/nextjs";

interface BriefingScreenProps {
  onAcknowledge: () => void;
  showSignInNudge: boolean;
}

export function BriefingScreen({
  onAcknowledge,
  showSignInNudge,
}: BriefingScreenProps) {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-lg border border-border bg-surface p-8">
        <span className="rounded border border-[#dc2626] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#dc2626]">
          SEV-1
        </span>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Payment Retry Storm
        </h1>

        <p className="mt-4 text-sm text-foreground">
          You are the primary engineer responding to a checkout degradation.
          Checkout reliability is business-critical.
        </p>

        <p className="mt-4 rounded-md border border-border bg-background p-4 text-sm text-muted">
          Restore checkout while minimizing customer impact and unnecessary
          infrastructure changes.
        </p>

        <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
          <div>
            <dt className="uppercase tracking-wide text-muted">Difficulty</dt>
            <dd className="mt-1 text-foreground">Senior</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">
              Expected Time
            </dt>
            <dd className="mt-1 text-foreground">15–20 min</dd>
          </div>
          <div>
            <dt className="uppercase tracking-wide text-muted">System</dt>
            <dd className="mt-1 text-foreground">Checkout / Payments</dd>
          </div>
        </dl>

        {showSignInNudge && (
          <p className="mt-6 text-xs text-muted">
            Playing as a guest — your score won&apos;t be saved or appear on
            the leaderboard.{" "}
            <SignInButton mode="modal">
              <button type="button" className="underline hover:text-foreground">
                Sign in
              </button>
            </SignInButton>{" "}
            to save this attempt.
          </p>
        )}

        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-8 w-full rounded-md border border-foreground bg-foreground px-4 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          Acknowledge Incident
        </button>
      </div>
    </main>
  );
}
