"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ScenarioOption {
  id: string;
  slug: string;
  name: string;
  isFree: boolean;
}

/**
 * Platform-admin Weekly Challenge control (phase-challege-version.md
 * §2/§13). Mirrors ScenarioEditForm's shape: client form → PATCH →
 * router.refresh(). "Activate" always replaces any currently-active
 * challenge (activateWeeklyChallenge deactivates the old row and inserts
 * the new one atomically) — there is never a separate "replace" action,
 * since activating is already idempotent/safe to call with a different
 * scenario at any time.
 */
export function WeeklyChallengeForm({
  scenarios,
  activeScenarioId,
}: {
  scenarios: ScenarioOption[];
  activeScenarioId: string | null;
}) {
  const router = useRouter();
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    activeScenarioId ?? scenarios[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(body: Record<string, unknown>, successMessage: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/weekly-challenge", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      setNotice(successMessage);
      router.refresh();
    });
  }

  function handleActivate() {
    if (!selectedScenarioId) return;
    submit({ scenarioId: selectedScenarioId }, "Weekly Challenge activated.");
  }

  function handleDeactivate() {
    submit({ action: "deactivate" }, "Weekly Challenge deactivated.");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Scenario</p>
        <select
          value={selectedScenarioId}
          onChange={(e) => setSelectedScenarioId(e.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name} ({scenario.isFree ? "free" : "paid"})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || !selectedScenarioId}
          onClick={handleActivate}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Activate
        </button>
        {activeScenarioId && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleDeactivate}
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40 disabled:opacity-40"
          >
            Deactivate
          </button>
        )}
        {error && <p className="text-sm text-[#dc2626]">{error}</p>}
        {notice && <p className="text-sm text-muted">{notice}</p>}
      </div>
    </div>
  );
}
