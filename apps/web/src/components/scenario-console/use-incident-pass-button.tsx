"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface UseIncidentPassButtonProps {
  passId: string;
  scenarioSlug: string;
  scenarioName: string;
}

/**
 * The explicit, irreversible pass-binding confirmation
 * (docs/implementation_plan/phase8loc.md: "The UI must warn the user
 * before binding: 'Use your Incident Pass for this incident? Once
 * selected, this pass can't be moved to another incident.'"). Mirrors
 * FinishIncidentDialog's focus-management/Escape pattern (focus the
 * cancel control on open, Escape closes without confirming) since both
 * are irreversible-action confirmations.
 */
export function UseIncidentPassButton({
  passId,
  scenarioSlug,
  scenarioName,
}: UseIncidentPassButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBinding, setIsBinding] = useState(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelButtonRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function handleConfirm() {
    setError(null);
    setIsBinding(true);
    fetch(`/api/incident-passes/${passId}/bind`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    })
      .then(async (response) => {
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(data.error ?? "Failed to bind Incident Pass");
          setIsBinding(false);
          return;
        }
        router.refresh();
      })
      .catch(() => {
        setError("Failed to bind Incident Pass");
        setIsBinding(false);
      });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Use Incident Pass
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="use-pass-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6">
            <h2 id="use-pass-dialog-title" className="text-lg font-semibold tracking-tight">
              Use your Incident Pass for {scenarioName}?
            </h2>
            <p className="mt-3 text-sm text-muted">
              Once selected, this pass can&apos;t be moved to another incident.
            </p>

            {error && (
              <p className="mt-3 text-sm text-[#dc2626]" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={() => setOpen(false)}
                disabled={isBinding}
                className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isBinding}
                className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBinding ? "Binding…" : "Use This Pass"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
