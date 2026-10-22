"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CreateScenarioFormProps {
  slug: string;
}

export function CreateScenarioForm({ slug }: CreateScenarioFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scenarioSlug, setScenarioSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugEdited) setScenarioSlug(slugify(value));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/organizations/${slug}/scenarios`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slug: scenarioSlug }),
        });
        const data = (await response.json()) as {
          scenario?: { id: string };
          error?: string;
        };
        if (!response.ok || !data.scenario) {
          setError(data.error ?? "Failed to create scenario");
          return;
        }
        router.push(`/organizations/${slug}/scenarios/${data.scenario.id}/edit`);
      } catch {
        setError("Failed to create scenario");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="scenario-name" className="font-mono text-xs uppercase tracking-wide text-muted">
            Scenario Name
          </label>
          <input
            id="scenario-name"
            type="text"
            required
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="Database Connection Saturation"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="scenario-slug" className="font-mono text-xs uppercase tracking-wide text-muted">
            Slug
          </label>
          <input
            id="scenario-slug"
            type="text"
            required
            value={scenarioSlug}
            onChange={(event) => {
              setSlugEdited(true);
              setScenarioSlug(slugify(event.target.value));
            }}
            placeholder="database-connection-saturation"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || name.trim().length === 0 || scenarioSlug.length === 0}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Creating…" : "Create Scenario"}
        </button>
      </div>
      {error && <p className="text-sm text-[#dc2626]">{error}</p>}
    </form>
  );
}
