"use client";

import { useEffect, useRef } from "react";

const STEPS = [
  "Review the system and live metrics.",
  "Wait for the incident to begin.",
  "Change one or more controls.",
  "Apply your changes.",
  "Observe how the system responds.",
  "Finish the incident when you are satisfied with the state.",
];

interface HowToRespondProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Product-level "how this works" instructions, shown expanded by default
 * on first reaching the incident-solving screen (docs/implementation_plan/
 * incidentrank-incident-solving-screen-ux-reorder.md §2) — distinct from
 * Incident Brief's scenario-specific context. Mirrors IncidentBrief's
 * exact interaction shell (non-modal side drawer, Escape/backdrop/Close
 * to dismiss, autofocused Close button, controlled open/onClose from the
 * parent) so the two feel like a matched pair, per spec §10. Static
 * content only — never scenario-derived, so no scenario/architecture
 * props are needed here.
 */
export function HowToRespond({ open, onClose }: HowToRespondProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close how to respond"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-to-respond-heading"
        className="relative z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2
            id="how-to-respond-heading"
            className="font-mono text-[10px] uppercase tracking-wide text-muted"
          >
            How to Respond
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close how to respond"
            className="rounded-md border border-border px-2 py-1 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            Close
          </button>
        </div>

        <ol className="mt-4 flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="font-mono text-xs text-muted">{index + 1}.</span>
              <span className="text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
