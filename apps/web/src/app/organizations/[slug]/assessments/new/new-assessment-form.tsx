"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Difficulty = "beginner" | "intermediate" | "senior" | "staff" | "senior_staff" | "principal";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

const PAGE_SIZE = 20;

export interface AssessableScenarioOption {
  id: string;
  name: string;
  description: string;
  difficulty: Difficulty;
  category: string | null;
  estimatedMinutes: number;
}

interface NewAssessmentFormProps {
  slug: string;
  scenarios: AssessableScenarioOption[];
}

export function NewAssessmentForm({ slug, scenarios }: NewAssessmentFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState("");
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const s of scenarios) if (s.category) set.add(s.category);
    return [...set].sort();
  }, [scenarios]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scenarios.filter((s) => {
      if (q) {
        const haystack = `${s.name} ${s.description} ${s.category ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (difficulties.length > 0 && !difficulties.includes(s.difficulty)) return false;
      if (categories.length > 0 && (!s.category || !categories.includes(s.category))) return false;
      return true;
    });
  }, [scenarios, query, difficulties, categories]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedScenario = scenarios.find((s) => s.id === scenarioId) ?? null;

  function resetToFirstPage() {
    setPage(1);
  }

  function toggleDifficulty(d: Difficulty) {
    setDifficulties((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
    resetToFirstPage();
  }

  function toggleCategory(c: string) {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    resetToFirstPage();
  }

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
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-6">
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

      <fieldset>
        <legend className="font-mono text-xs uppercase tracking-wide text-muted">
          Scenario
        </legend>

        {selectedScenario ? (
          <div className="mt-3 rounded-md border border-foreground bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{selectedScenario.name}</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
                  {DIFFICULTY_LABEL[selectedScenario.difficulty]}
                  {selectedScenario.category ? ` · ${selectedScenario.category}` : ""} · ~
                  {selectedScenario.estimatedMinutes} min
                </p>
                <p className="mt-2 text-sm text-muted">{selectedScenario.description}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <a
                  href={`/organizations/${slug}/assessments/new/scenario-preview/${selectedScenario.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  Preview →
                </a>
                <button
                  type="button"
                  onClick={() => setScenarioId(null)}
                  className="font-mono text-xs text-muted hover:text-foreground"
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
            <aside className="flex flex-col gap-5">
              <div>
                <label htmlFor="scenario-search" className="font-mono text-[10px] uppercase tracking-wide text-muted">
                  Search
                </label>
                <input
                  id="scenario-search"
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    resetToFirstPage();
                  }}
                  placeholder="kafka, database…"
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted"
                />
              </div>

              <div>
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Difficulty</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                    <label key={d} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={difficulties.includes(d)}
                        onChange={() => toggleDifficulty(d)}
                      />
                      {DIFFICULTY_LABEL[d]}
                    </label>
                  ))}
                </div>
              </div>

              {allCategories.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Category</p>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {allCategories.map((c) => (
                      <label key={c} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={categories.includes(c)}
                          onChange={() => toggleCategory(c)}
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            <div>
              <p className="font-mono text-xs text-muted">
                {filtered.length} scenario{filtered.length === 1 ? "" : "s"}
              </p>

              {filtered.length === 0 ? (
                <p className="mt-6 text-sm text-muted">No scenarios match these filters.</p>
              ) : (
                <>
                  <div className="mt-4 flex flex-col gap-2">
                    {pageItems.map((scenario) => (
                      <div
                        key={scenario.id}
                        className="flex items-start justify-between gap-4 rounded-md border border-border p-4 transition-colors hover:border-foreground/40"
                      >
                        <button
                          type="button"
                          onClick={() => setScenarioId(scenario.id)}
                          className="flex-1 text-left"
                        >
                          <p className="text-sm font-medium">{scenario.name}</p>
                          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted">
                            {DIFFICULTY_LABEL[scenario.difficulty]}
                            {scenario.category ? ` · ${scenario.category}` : ""} · ~
                            {scenario.estimatedMinutes} min
                          </p>
                          <p className="mt-2 text-sm text-muted">{scenario.description}</p>
                        </button>
                        <a
                          href={`/organizations/${slug}/assessments/new/scenario-preview/${scenario.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-md border border-border px-3 py-1.5 font-mono text-xs text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
                        >
                          Preview →
                        </a>
                      </div>
                    ))}
                  </div>

                  {pageCount > 1 && (
                    <div className="mt-4 flex items-center justify-between font-mono text-xs text-muted">
                      <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className="rounded border border-border px-3 py-1.5 disabled:opacity-40"
                      >
                        ← Previous
                      </button>
                      <span>
                        Page {currentPage} of {pageCount}
                      </span>
                      <button
                        type="button"
                        disabled={currentPage >= pageCount}
                        onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                        className="rounded border border-border px-3 py-1.5 disabled:opacity-40"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </fieldset>

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
