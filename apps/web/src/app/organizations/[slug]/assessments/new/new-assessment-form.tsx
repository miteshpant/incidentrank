"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ScenarioOption {
  id: string;
  name: string;
}

interface NewAssessmentFormProps {
  slug: string;
  scenarios: ScenarioOption[];
}

export function NewAssessmentForm({ slug, scenarios }: NewAssessmentFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/organizations/${slug}/assessments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, scenarioId }),
        });
        const data = (await response.json()) as {
          assessment?: { id: string };
          error?: string;
        };
        if (!response.ok || !data.assessment) {
          setError(data.error ?? "Failed to create assessment");
          return;
        }
        router.push(`/organizations/${slug}/assessments/${data.assessment.id}`);
      } catch {
        setError("Failed to create assessment");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
      <div>
        <label htmlFor="assessment-name" className="font-mono text-xs uppercase tracking-wide text-muted">
          Assessment Name
        </label>
        <input
          id="assessment-name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Staff Backend Engineer Assessment"
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </div>

      <div>
        <label htmlFor="assessment-scenario" className="font-mono text-xs uppercase tracking-wide text-muted">
          Scenario
        </label>
        <select
          id="assessment-scenario"
          required
          value={scenarioId}
          onChange={(event) => setScenarioId(event.target.value)}
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
        >
          {scenarios.map((scenario) => (
            <option key={scenario.id} value={scenario.id}>
              {scenario.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-[#dc2626]">{error}</p>}

      <button
        type="submit"
        disabled={isPending || name.trim().length === 0 || !scenarioId}
        className="self-start rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create Assessment"}
      </button>
    </form>
  );
}
