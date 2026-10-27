"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

interface ReferralPreview {
  alreadyClaimed: boolean;
  expired: boolean;
  revoked: boolean;
}

export function ReferralClaim({ code }: { code: string }) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [preview, setPreview] = useState<ReferralPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/r/${code}`)
      .then(async (response) => {
        const data = (await response.json()) as ReferralPreview & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setPreviewError(data.error ?? "Invalid referral link");
          return;
        }
        setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Failed to load referral link");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  function handleClaim() {
    setClaimError(null);
    setIsClaiming(true);
    fetch(`/api/r/${code}`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as { passId?: string; error?: string };
        if (!response.ok || !data.passId) {
          setClaimError(data.error ?? "Failed to claim referral");
          setIsClaiming(false);
          return;
        }
        router.push("/incidents");
      })
      .catch(() => {
        setClaimError("Failed to claim referral");
        setIsClaiming(false);
      });
  }

  if (previewError) {
    return <p className="mt-10 text-sm text-[#dc2626]">{previewError}</p>;
  }
  if (!preview) {
    return <p className="mt-10 text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="mt-10">
      <h1 className="text-2xl font-semibold tracking-tight">You&apos;ve been referred to IncidentRank</h1>
      <p className="mt-2 text-sm text-muted">
        Sign in to receive one Incident Pass and choose a premium incident to try.
      </p>

      {preview.revoked ? (
        <p className="mt-8 text-sm text-[#dc2626]">This referral link is no longer valid.</p>
      ) : preview.expired ? (
        <p className="mt-8 text-sm text-[#dc2626]">This referral link has expired.</p>
      ) : !isLoaded ? null : !isSignedIn ? (
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
          {claimError && <p className="mb-3 text-sm text-[#dc2626]">{claimError}</p>}
          <button
            type="button"
            disabled={isClaiming}
            onClick={handleClaim}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isClaiming ? "Claiming…" : "Claim Your Incident Pass"}
          </button>
        </div>
      )}
    </div>
  );
}
