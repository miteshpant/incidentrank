"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignInButton } from "@clerk/nextjs";

interface AdminInvitePreview {
  email: string;
  role: string;
  alreadyAccepted: boolean;
  expired: boolean;
  revoked: boolean;
}

export function AdminInviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  const { isSignedIn, isLoaded } = useAuth();
  const [preview, setPreview] = useState<AdminInvitePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/invite/${token}`)
      .then(async (response) => {
        const data = (await response.json()) as AdminInvitePreview & { error?: string };
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

  function handleAccept() {
    setAcceptError(null);
    setIsAccepting(true);
    fetch(`/api/admin/invite/${token}`, { method: "POST" })
      .then(async (response) => {
        const data = (await response.json()) as { membership?: unknown; error?: string };
        if (!response.ok || !data.membership) {
          setAcceptError(data.error ?? "Failed to accept invitation");
          setIsAccepting(false);
          return;
        }
        router.push("/admin");
      })
      .catch(() => {
        setAcceptError("Failed to accept invitation");
        setIsAccepting(false);
      });
  }

  if (previewError) {
    return <p className="mt-10 text-sm text-[#dc2626]">{previewError}</p>;
  }
  if (!preview) {
    return <p className="mt-10 text-sm text-muted">Loading invitation…</p>;
  }

  return (
    <div className="mt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Admin Invitation</h1>
      <p className="mt-2 text-sm text-muted">
        Invited as <span className="text-foreground">{preview.role}</span> for{" "}
        <span className="text-foreground">{preview.email}</span>.
      </p>

      {preview.revoked ? (
        <p className="mt-8 text-sm text-[#dc2626]">This invitation has been revoked.</p>
      ) : preview.expired ? (
        <p className="mt-8 text-sm text-[#dc2626]">This invitation has expired.</p>
      ) : !isLoaded ? null : !isSignedIn ? (
        <div className="mt-8">
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Sign in with your @incidentrank.com account
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
