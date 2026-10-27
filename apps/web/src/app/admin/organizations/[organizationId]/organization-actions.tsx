"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface OrganizationActionsProps {
  organizationId: string;
  status: "pending" | "active" | "suspended";
}

export function OrganizationActions({ organizationId, status }: OrganizationActionsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedInviteUrl, setFailedInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [showSuspendForm, setShowSuspendForm] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");

  function runAction(path: string, body?: unknown) {
    setError(null);
    setNotice(null);
    setFailedInviteUrl(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/organizations/${organizationId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        emailSent?: boolean;
        invitation?: { email: string };
        inviteUrl?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      if (data.invitation) {
        if (data.emailSent) {
          setNotice(`Invitation sent to ${data.invitation.email}.`);
        } else {
          setNotice(`Invitation created for ${data.invitation.email}, but email delivery failed.`);
          setFailedInviteUrl(data.inviteUrl ?? null);
        }
      }
      setShowSuspendForm(false);
      setShowRecoveryForm(false);
      setSuspendReason("");
      setRecoveryEmail("");
      setRecoveryReason("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {status !== "suspended" && !showSuspendForm && (
          <button
            type="button"
            onClick={() => setShowSuspendForm(true)}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-[#dc2626] hover:text-[#dc2626]"
          >
            Suspend
          </button>
        )}
        {status === "suspended" && (
          <button
            type="button"
            disabled={isPending}
            onClick={() => runAction("/reactivate")}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reactivate
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => runAction("/owner-invite/resend")}
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Resend Owner Invite
        </button>
        {!showRecoveryForm && (
          <button
            type="button"
            onClick={() => setShowRecoveryForm(true)}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
          >
            Invite Recovery Owner
          </button>
        )}
      </div>

      {showSuspendForm && (
        <div className="rounded-md border border-border bg-surface p-4">
          <label htmlFor="suspend-reason" className="font-mono text-xs uppercase tracking-wide text-muted">
            Suspension Reason (required)
          </label>
          <textarea
            id="suspend-reason"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={isPending || suspendReason.trim().length === 0}
              onClick={() => runAction("/suspend", { reason: suspendReason })}
              className="rounded-md border border-[#dc2626] bg-[#dc2626] px-4 py-2 font-mono text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Confirm Suspend
            </button>
            <button
              type="button"
              onClick={() => setShowSuspendForm(false)}
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showRecoveryForm && (
        <div className="rounded-md border border-border bg-surface p-4">
          <p className="text-xs text-muted">
            Invites a new owner regardless of organization status — the support path for a
            suspended-and-ownerless organization.
          </p>
          <div className="mt-3">
            <label htmlFor="recovery-email" className="font-mono text-xs uppercase tracking-wide text-muted">
              Owner Email
            </label>
            <input
              id="recovery-email"
              type="email"
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3">
            <label htmlFor="recovery-reason" className="font-mono text-xs uppercase tracking-wide text-muted">
              Reason (required)
            </label>
            <textarea
              id="recovery-reason"
              value={recoveryReason}
              onChange={(e) => setRecoveryReason(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={isPending || recoveryEmail.trim().length === 0 || recoveryReason.trim().length === 0}
              onClick={() => runAction("/owner-invite/recovery", { email: recoveryEmail, reason: recoveryReason })}
              className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send Recovery Invite
            </button>
            <button
              type="button"
              onClick={() => setShowRecoveryForm(false)}
              className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-[#dc2626]">{error}</p>}
      {notice && <p className="text-sm text-muted">{notice}</p>}
      {failedInviteUrl && (
        <div className="rounded-md border border-border bg-surface p-3">
          <p className="text-xs text-[#dc2626]">Share this invite link with the owner directly:</p>
          <code className="mt-2 block break-all font-mono text-xs text-muted">{failedInviteUrl}</code>
        </div>
      )}
    </div>
  );
}
