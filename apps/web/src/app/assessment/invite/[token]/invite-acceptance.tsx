"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

interface InvitePreview {
  organizationName: string;
  assessmentName: string;
  assessmentStatus: "draft" | "active" | "closed";
  candidateStatus: "invited" | "started" | "completed";
  candidateEmail: string;
  alreadyClaimed: boolean;
  expired: boolean;
}

interface InviteAcceptanceProps {
  token: string;
}

export function InviteAcceptance({ token }: InviteAcceptanceProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/assessment/invite/${token}`)
      .then(async (response) => {
        const data = (await response.json()) as InvitePreview & { error?: string };
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
    fetch(`/api/assessment/invite/${token}`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as {
          candidate?: { assessmentId: string };
          error?: string;
        };
        if (!response.ok || !data.candidate) {
          setAcceptError(
            response.status === 410
              ? "This invitation has expired."
              : (data.error ?? "Failed to accept invitation"),
          );
          setIsAccepting(false);
          return;
        }
        router.push(`/assessment/${data.candidate.assessmentId}`);
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
        You&apos;ve been invited to complete an IncidentRank assessment for{" "}
        <span className="text-foreground">{preview.organizationName}</span>.
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {preview.assessmentName}
      </h1>

      {preview.expired ? (
        <p className="mt-8 text-sm text-[#dc2626]">
          This invitation has expired. Contact {preview.organizationName} for
          a new invitation.
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
            {isAccepting ? "Accepting…" : "Accept Invitation"}
          </button>
        </div>
      )}
    </div>
  );
}
