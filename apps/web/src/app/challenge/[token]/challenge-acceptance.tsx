"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

interface ChallengeLanding {
  scenarioSlug: string;
  scenarioName: string;
  challengerDisplayName: string | null;
}

/**
 * docs/implementation_plan/phase-challege-version.md §7/§8 — the no-
 * spoiler challenge landing. Mirrors InviteAcceptance's exact shape
 * (apps/web/src/app/assessment/invite/[token]/invite-acceptance.tsx):
 * fetch preview on mount, sign-in gate, then accept. The preview
 * endpoint (GET /api/challenges/[token]) never returns score/tier/
 * actions/reasoning at all — there is nothing to redact client-side,
 * this component only ever has safe-to-show data in hand.
 */
export function ChallengeAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [challenge, setChallenge] = useState<ChallengeLanding | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/challenges/${token}`)
      .then(async (response) => {
        const data = (await response.json()) as { challenge?: ChallengeLanding; error?: string };
        if (cancelled) return;
        if (!response.ok || !data.challenge) {
          setPreviewError(data.error ?? "This challenge link is invalid or has expired.");
          return;
        }
        setChallenge(data.challenge);
      })
      .catch(() => {
        if (!cancelled) setPreviewError("This challenge link is invalid or has expired.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function handleAccept() {
    setAcceptError(null);
    setIsAccepting(true);
    fetch(`/api/challenges/${token}/accept`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as { scenarioSlug?: string; error?: string };
        if (!response.ok || !data.scenarioSlug) {
          setAcceptError(data.error ?? "Failed to accept challenge");
          setIsAccepting(false);
          return;
        }
        router.push(`/incidents/${data.scenarioSlug}`);
      })
      .catch(() => {
        setAcceptError("Failed to accept challenge");
        setIsAccepting(false);
      });
  }

  if (previewError) {
    return <p className="mt-10 text-sm text-[#dc2626]">{previewError}</p>;
  }

  if (!challenge) {
    return <p className="mt-10 text-sm text-muted">Loading challenge…</p>;
  }

  return (
    <div className="mt-10">
      <p className="font-mono text-xs uppercase tracking-widest text-muted">
        You&apos;ve been challenged
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{challenge.scenarioName}</h1>
      <p className="mt-3 text-sm text-muted">
        {challenge.challengerDisplayName
          ? `${challenge.challengerDisplayName} challenged you`
          : "An engineer challenged you"}{" "}
        — can you stabilize production with a better result?
      </p>

      {!isLoaded ? null : !isSignedIn ? (
        <div className="mt-8">
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Sign in / Create Account
            </button>
          </SignInButton>
        </div>
      ) : (
        <div className="mt-8">
          {acceptError && <p className="mb-3 text-sm text-[#dc2626]">{acceptError}</p>}
          <button
            type="button"
            disabled={isAccepting}
            onClick={handleAccept}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isAccepting ? "Accepting…" : "Accept Challenge"}
          </button>
        </div>
      )}
    </div>
  );
}
