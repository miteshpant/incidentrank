"use client";

import { useEffect, useRef } from "react";
import type { ArchitectureDefinition } from "@incidentrank/simulator";
import { BriefingContent, type BriefingContentScenario } from "./briefing-content";

interface IncidentBriefProps {
  scenario: BriefingContentScenario;
  architecture: ArchitectureDefinition;
  open: boolean;
  onClose: () => void;
}

/**
 * Persistent, reopenable mid-incident briefing (Phase 7.1,
 * docs/implementation_plan/phase7.action.md sections 9-10). Once an
 * incident starts, the pre-Acknowledge briefing screen unmounts and
 * nothing previously let the candidate re-read it — this is a
 * non-blocking side drawer (not a modal) so metrics/timeline stay
 * visible and scannable while it's open, rendering the exact same
 * BriefingContent the pre-start screen uses, never a second,
 * independently-maintained copy of the candidate-safe briefing text.
 */
export function IncidentBrief({ scenario, architecture, open, onClose }: IncidentBriefProps) {
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
        aria-label="Close incident brief"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="incident-brief-heading"
        className="relative z-50 flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="incident-brief-heading" className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Incident Brief
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close incident brief"
            className="rounded-md border border-border px-2 py-1 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            Close
          </button>
        </div>

        <div className="mt-4">
          <BriefingContent scenario={scenario} architecture={architecture} />
        </div>
      </aside>
    </div>
  );
}
