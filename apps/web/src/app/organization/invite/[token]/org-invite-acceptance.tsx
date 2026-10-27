"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

interface InvitePreview {
  organizationName: string;
  organizationSlug: string;
  role: "owner" | "admin" | "member";
  invitationState: "pending" | "accepted" | "expired" | "revoked";
  email: string;
}

const ROLE_LABEL: Record<InvitePreview["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

interface OrgInviteAcceptanceProps {
  token: string;
}

export function OrgInviteAcceptance({ token }: OrgInviteAcceptanceProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/organization/invite/${token}`)
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
    fetch(`/api/organization/invite/${token}`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as {
          organizationSlug?: string | null;
          error?: string;
        };
        if (!response.ok || !data.organizationSlug) {
          setAcceptError(
            response.status === 410
              ? "This invitation is no longer valid."
              : (data.error ?? "Failed to accept invitation"),
          );
          setIsAccepting(false);
          return;
        }
        router.push(`/organizations/${data.organizationSlug}`);
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
        You&apos;ve been invited to join{" "}
        <span className="text-foreground">{preview.organizationName}</span> on
        IncidentRank.
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {preview.organizationName}
      </h1>
      <p className="mt-2 font-mono text-xs uppercase tracking-wide text-muted">
        Role: {ROLE_LABEL[preview.role]}
      </p>

      {preview.invitationState === "expired" ? (
        <p className="mt-8 text-sm text-[#dc2626]">
          This invitation has expired. Ask {preview.organizationName} to send
          a new one.
        </p>
      ) : preview.invitationState === "revoked" ? (
        <p className="mt-8 text-sm text-[#dc2626]">
          This invitation has been revoked.
        </p>
      ) : preview.invitationState === "accepted" ? (
        <p className="mt-8 text-sm text-muted">
          This invitation has already been accepted.
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
