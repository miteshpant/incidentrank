"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

interface PromoInvitePreview {
  campaign: string | null;
  email: string;
  alreadyRedeemed: boolean;
  expired: boolean;
  revoked: boolean;
}

interface PromoInviteAcceptanceProps {
  token: string;
}

/**
 * Promotional-invite redemption — mirrors assessment invite/invite-
 * acceptance.tsx's structure exactly (preview on mount, SignInButton
 * gate, accept action), adapted for the Incident Pass grant instead of
 * assessment-candidate binding. On success, redirects to the scenario
 * library so the candidate can choose and bind their one premium
 * incident (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §9's "show scenario
 * chooser").
 */
export function PromoInviteAcceptance({ token }: PromoInviteAcceptanceProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [preview, setPreview] = useState<PromoInvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/promotional-invite/${token}`)
      .then(async (response) => {
        const data = (await response.json()) as PromoInvitePreview & { error?: string };
        if (cancelled) return;
        if (!response.ok) {
          setPreviewError(data.error ?? "Invalid invitation");
          return;
        }
        setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreviewError("Failed to load invitation");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleAccept = () => {
    setAcceptError(null);
    setIsAccepting(true);
    fetch(`/api/promotional-invite/${token}`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as { passId?: string; error?: string };
        if (!response.ok || !data.passId) {
          setAcceptError(
            response.status === 410
              ? "This invitation has expired."
              : (data.error ?? "Failed to accept invitation"),
          );
          setIsAccepting(false);
          return;
        }
        router.push("/incidents");
      })
      .catch(() => {
        setAcceptError("Failed to accept invitation");
        setIsAccepting(false);
      });
  };

  if (previewError) {
    return <p className="mt-10 text-sm text-[#dc2626]">{previewError}</p>;
  }

  if (!preview) {
    return <p className="mt-10 text-sm text-muted">Loading invitation…</p>;
  }

  return (
    <div className="mt-10">
      <p className="text-sm text-muted">
        You&apos;ve been invited to try one IncidentRank production incident
        at no cost.
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        Incident Pass
      </h1>
      <p className="mt-2 text-sm text-muted">
        This invitation is intended for{" "}
        <span className="text-foreground">{preview.email}</span>.
      </p>

      {preview.revoked ? (
        <p className="mt-8 text-sm text-[#dc2626]">This invitation has been revoked.</p>
      ) : preview.expired ? (
        <p className="mt-8 text-sm text-[#dc2626]">
          This invitation has expired. Contact IncidentRank for a new invitation.
        </p>
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
          {acceptError && <p className="mb-3 text-sm text-[#dc2626]">{acceptError}</p>}
          <button
            type="button"
            disabled={isAccepting}
            onClick={handleAccept}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isAccepting ? "Redeeming…" : "Choose your incident"}
          </button>
        </div>
      )}
    </div>
  );
}
