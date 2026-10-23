"use client";

import { useState } from "react";

const MAX_NOTE_LENGTH = 1000;

interface FinishIncidentDialogProps {
  open: boolean;
  finishing: boolean;
  finishError: string | null;
  onConfirm: (note: string | null) => void;
  onCancel: () => void;
}

/**
 * The required confirmation dialog for candidate-declared completion
 * (docs/implementation_plan/phase6.1.md's "Confirmation Dialog" /
 * "Do not use a casual single-click destructive action"). Deliberately
 * never indicates whether the current state is actually acceptable — no
 * "looks good!" or "not stable yet" hint anywhere in this component, since
 * that would leak the hidden completion criteria and turn Finish into
 * exactly the repeatable "Am I done yet?" oracle the whole model exists to
 * prevent.
 */
export function FinishIncidentDialog({
  open,
  finishing,
  finishError,
  onConfirm,
  onCancel,
}: FinishIncidentDialogProps) {
  const [note, setNote] = useState("");

  if (!open) return null;

  const trimmedNote = note.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-incident-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
        <h2 id="finish-incident-dialog-title" className="text-lg font-semibold tracking-tight">
          Finish this incident?
        </h2>

        <p className="mt-3 text-sm text-muted">
          You&apos;re declaring that the system is sufficiently stabilized and that
          you&apos;re finished making changes.
        </p>
        <p className="mt-2 text-sm font-medium">
          This will end the incident and cannot be undone.
        </p>

        <label htmlFor="finish-incident-note" className="mt-5 block text-sm text-muted">
          Why are you ready to hand the system back?{" "}
          <span className="text-xs text-muted">(optional)</span>
        </label>
        <textarea
          id="finish-incident-note"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE_LENGTH))}
          disabled={finishing}
          rows={3}
          placeholder="e.g. Customer errors are back to baseline. Some backlog remains but is draining safely."
          className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
        <p className="mt-1 text-right font-mono text-[10px] text-muted">
          {trimmedNote.length} / {MAX_NOTE_LENGTH}
        </p>

        {finishError && (
          <p className="mt-3 text-sm text-[#dc2626]" role="alert">
            {finishError}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={finishing}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Keep Working
          </button>
          <button
            type="button"
            onClick={() => onConfirm(trimmedNote.length > 0 ? trimmedNote : null)}
            disabled={finishing}
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {finishing ? "Finishing…" : "Finish Incident"}
          </button>
        </div>
      </div>
    </div>
  );
}
