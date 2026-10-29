"use client";

import { useState, useTransition } from "react";

const CONFIRM_PHRASE = "DELETE";

/**
 * Phase 10D §43. Strong confirmation before a real, synchronous,
 * server-side anonymization — never a fake instant-delete that the
 * backend doesn't actually perform. Requires typing a literal confirm
 * phrase, not just a single click.
 */
export function DeleteAccountSection() {
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/account/delete", { method: "POST" });
      if (response.ok) {
        setDone(true);
      } else {
        setError("Could not delete your account. Please try again.");
      }
    });
  }

  if (done) {
    return (
      <div>
        <p className="font-mono text-xs uppercase tracking-wide text-muted">Danger Zone</p>
        <p className="mt-3 text-sm text-muted">
          Your account has been deleted. You&apos;ll need to sign up again to use IncidentRank.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-wide text-muted">Danger Zone</p>
      <p className="mt-3 text-sm text-muted">
        Deleting your account anonymizes your profile (display name and sign-in are disconnected
        immediately) and cannot be undone. Organization membership history, completed assessment
        results an organization relied on, and billing/credit history are retained, associated
        with an anonymized reference rather than your identity — this preserves other
        organizations&apos; legitimate records and your own audit trail.
      </p>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="mt-4 rounded-md border border-[#dc2626] px-4 py-2 font-mono text-sm text-[#dc2626] transition-colors hover:bg-[#dc2626]/10"
        >
          Delete Account
        </button>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-[#dc2626] p-4">
          <label htmlFor="confirmDelete" className="text-sm">
            Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm.
          </label>
          <input
            id="confirmDelete"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending || confirmText !== CONFIRM_PHRASE}
              onClick={submit}
              className="rounded-md border border-[#dc2626] bg-[#dc2626] px-4 py-2 font-mono text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Deleting…" : "Permanently Delete"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfirm(false);
                setConfirmText("");
              }}
              className="rounded-md border border-border px-4 py-2 font-mono text-sm"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-xs text-[#dc2626]">{error}</p>}
        </div>
      )}
    </div>
  );
}
