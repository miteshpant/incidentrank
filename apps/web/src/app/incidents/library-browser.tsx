"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ScenarioDefinition } from "@incidentrank/scenarios";
import type { ScenarioPracticeProgress } from "@/lib/server/practice-progress";

const DIFFICULTY_LABEL: Record<ScenarioDefinition["difficulty"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

const DURATION_RANGES = [
  { key: "under10", label: "< 10 minutes", test: (m: number) => m < 10 },
  { key: "10to20", label: "10–20 minutes", test: (m: number) => m >= 10 && m <= 20 },
  { key: "20to30", label: "20–30 minutes", test: (m: number) => m > 20 && m <= 30 },
  { key: "30plus", label: "30+ minutes", test: (m: number) => m > 30 },
] as const;

type SortKey = "recommended" | "newest" | "difficulty" | "duration" | "name";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "recommended", label: "Recommended" },
  { key: "newest", label: "Newest" },
  { key: "difficulty", label: "Difficulty" },
  { key: "duration", label: "Duration" },
  { key: "name", label: "Name" },
];

const DIFFICULTY_RANK: Record<ScenarioDefinition["difficulty"], number> = {
  beginner: 0,
  intermediate: 1,
  senior: 2,
  staff: 3,
  senior_staff: 4,
  principal: 5,
};

export interface LibraryEntry {
  definition: ScenarioDefinition;
  progress: ScenarioPracticeProgress | null;
}

interface LibraryBrowserProps {
  entries: LibraryEntry[];
  isSignedIn: boolean;
}

function getParam(params: URLSearchParams, key: string): string[] {
  const value = params.get(key);
  return value ? value.split(",").filter(Boolean) : [];
}

/**
 * The public scenario library: search, filters, sort, all persisted in
 * the URL query string (docs/implementation_plan/phase6.md's "Filter URL
 * State") — shareable, bookmarkable, back-button-safe, no global
 * application state. AND semantics between filter groups; OR semantics
 * within a multi-select group (tags). Grouping stays deliberately simple
 * (search + filters + cards) per the spec's "keep the UI simple enough
 * for Phase 6."
 */
export function LibraryBrowser({ entries, isSignedIn }: LibraryBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const query = searchParams.get("q") ?? "";
  const categories = getParam(searchParams, "category");
  const difficulties = getParam(searchParams, "difficulty");
  const access = searchParams.get("access") ?? "all";
  const progressFilter = searchParams.get("progress") ?? "all";
  const durations = getParam(searchParams, "duration");
  const tags = getParam(searchParams, "tags");
  const sort = (searchParams.get("sort") as SortKey | null) ?? "recommended";

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      for (const tag of entry.definition.library?.tags ?? []) set.add(tag);
    }
    return [...set].sort();
  }, [entries]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    for (const entry of entries) {
      if (entry.definition.library) set.add(entry.definition.library.category);
    }
    return [...set].sort();
  }, [entries]);

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    mutate(next);
    const qs = next.toString();
    router.replace(qs ? `/incidents?${qs}` : "/incidents", { scroll: false });
  }

  function toggleListParam(key: string, value: string, current: string[]) {
    updateParams((params) => {
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      if (next.length === 0) params.delete(key);
      else params.set(key, next.join(","));
    });
  }

  function setSingleParam(key: string, value: string, defaultValue: string) {
    updateParams((params) => {
      if (value === defaultValue) params.delete(key);
      else params.set(key, value);
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return entries.filter((entry) => {
      const { definition } = entry;
      const lib = definition.library;

      if (q) {
        const haystack = [
          definition.name,
          definition.description,
          lib?.category ?? "",
          ...(lib?.tags ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (categories.length > 0 && (!lib || !categories.includes(lib.category))) {
        return false;
      }

      if (difficulties.length > 0 && !difficulties.includes(definition.difficulty)) {
        return false;
      }

      if (access === "free" && !definition.isFree) return false;
      if (access === "paid" && definition.isFree) return false;

      if (durations.length > 0) {
        const matchesAnyRange = DURATION_RANGES.filter((r) => durations.includes(r.key)).some(
          (r) => r.test(definition.estimatedMinutes),
        );
        if (!matchesAnyRange) return false;
      }

      if (tags.length > 0) {
        const entryTags = lib?.tags ?? [];
        if (!tags.some((t) => entryTags.includes(t))) return false;
      }

      if (isSignedIn && progressFilter !== "all") {
        const attemptCount = entry.progress?.attemptCount ?? 0;
        const completed = entry.progress?.completed ?? false;
        if (progressFilter === "not_attempted" && attemptCount > 0) return false;
        if (progressFilter === "attempted" && (attemptCount === 0 || completed)) return false;
        if (progressFilter === "completed" && !completed) return false;
      }

      return true;
    });
  }, [entries, query, categories, difficulties, access, durations, tags, isSignedIn, progressFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sort) {
      case "name":
        return copy.sort((a, b) => a.definition.name.localeCompare(b.definition.name));
      case "difficulty":
        return copy.sort(
          (a, b) => DIFFICULTY_RANK[a.definition.difficulty] - DIFFICULTY_RANK[b.definition.difficulty],
        );
      case "duration":
        return copy.sort((a, b) => a.definition.estimatedMinutes - b.definition.estimatedMinutes);
      case "newest":
        // No authored publish-date signal yet — do not invent ranking
        // data (per phase6.md); stable order is the least-wrong default.
        return copy;
      case "recommended":
      default:
        return copy.sort((a, b) => {
          if (a.definition.isFree !== b.definition.isFree) return a.definition.isFree ? -1 : 1;
          return a.definition.name.localeCompare(b.definition.name);
        });
    }
  }, [filtered, sort]);

  return (
    <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-6">
        <div>
          <label htmlFor="library-search" className="font-mono text-[10px] uppercase tracking-wide text-muted">
            Search
          </label>
          <input
            id="library-search"
            type="text"
            value={query}
            placeholder="kafka, database, retries…"
            onChange={(e) =>
              updateParams((params) => {
                if (e.target.value) params.set("q", e.target.value);
                else params.delete("q");
              })
            }
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted"
          />
        </div>

        <FilterGroup label="Access">
          {["all", "free", "paid"].map((value) => (
            <RadioOption
              key={value}
              label={value === "all" ? "All" : value === "free" ? "Free" : "Paid"}
              checked={access === value}
              onClick={() => setSingleParam("access", value, "all")}
            />
          ))}
        </FilterGroup>

        {isSignedIn && (
          <FilterGroup label="Progress">
            {[
              { value: "all", label: "All" },
              { value: "not_attempted", label: "Not Attempted" },
              { value: "attempted", label: "Attempted" },
              { value: "completed", label: "Completed" },
            ].map(({ value, label }) => (
              <RadioOption
                key={value}
                label={label}
                checked={progressFilter === value}
                onClick={() => setSingleParam("progress", value, "all")}
              />
            ))}
          </FilterGroup>
        )}

        <FilterGroup label="Category">
          {allCategories.map((category) => (
            <CheckboxOption
              key={category}
              label={category}
              checked={categories.includes(category)}
              onClick={() => toggleListParam("category", category, categories)}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="Difficulty">
          {(Object.keys(DIFFICULTY_LABEL) as Array<ScenarioDefinition["difficulty"]>).map((d) => (
            <CheckboxOption
              key={d}
              label={DIFFICULTY_LABEL[d]}
              checked={difficulties.includes(d)}
              onClick={() => toggleListParam("difficulty", d, difficulties)}
            />
          ))}
        </FilterGroup>

        <FilterGroup label="Duration">
          {DURATION_RANGES.map((range) => (
            <CheckboxOption
              key={range.key}
              label={range.label}
              checked={durations.includes(range.key)}
              onClick={() => toggleListParam("duration", range.key, durations)}
            />
          ))}
        </FilterGroup>

        {allTags.length > 0 && (
          <FilterGroup label="Skills / Tags">
            {allTags.map((tag) => (
              <CheckboxOption
                key={tag}
                label={tag}
                checked={tags.includes(tag)}
                onClick={() => toggleListParam("tags", tag, tags)}
              />
            ))}
          </FilterGroup>
        )}
      </aside>

      <div>
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-xs text-muted">
            {sorted.length} scenario{sorted.length === 1 ? "" : "s"}
          </p>
          <label className="flex items-center gap-2 font-mono text-xs text-muted">
            Sort
            <select
              value={sort}
              onChange={(e) => setSingleParam("sort", e.target.value, "recommended")}
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sorted.length === 0 ? (
          <p className="mt-10 text-sm text-muted">
            No scenarios match these filters.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {sorted.map((entry) => (
              <ScenarioCard key={entry.definition.slug} entry={entry} isSignedIn={isSignedIn} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</h3>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function RadioOption({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex items-center gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors ${
        checked ? "text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      <span
        className={`h-3 w-3 shrink-0 rounded-full border ${
          checked ? "border-accent bg-accent" : "border-border"
        }`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

function CheckboxOption({
  label,
  checked,
  onClick,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`flex items-center gap-2 rounded px-1.5 py-1 text-left text-sm transition-colors ${
        checked ? "text-foreground" : "text-muted hover:text-foreground"
      }`}
    >
      <span
        className={`h-3 w-3 shrink-0 rounded border ${
          checked ? "border-accent bg-accent" : "border-border"
        }`}
        aria-hidden="true"
      />
      {label}
    </button>
  );
}

function ScenarioCard({ entry, isSignedIn }: { entry: LibraryEntry; isSignedIn: boolean }) {
  const { definition, progress } = entry;
  const lib = definition.library;

  return (
    <article className="flex flex-col rounded-lg border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{definition.name}</h2>
        {!definition.isFree && (
          <span className="shrink-0 rounded border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
            🔒 Paid
          </span>
        )}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted">
        {lib && (
          <div>
            <dt className="uppercase tracking-wide">Category</dt>
            <dd className="mt-1 text-foreground">{lib.category}</dd>
          </div>
        )}
        <div>
          <dt className="uppercase tracking-wide">Difficulty</dt>
          <dd className="mt-1 text-foreground">{DIFFICULTY_LABEL[definition.difficulty]}</dd>
        </div>
        <div>
          <dt className="uppercase tracking-wide">Est. time</dt>
          <dd className="mt-1 text-foreground">~{definition.estimatedMinutes} min</dd>
        </div>
      </dl>

      <p className="mt-4 flex-1 text-sm text-muted text-pretty">
        {lib?.shortDescription ?? definition.description}
      </p>

      {lib && lib.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {lib.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {isSignedIn && (
        <p className="mt-4 font-mono text-[11px] text-muted">
          {progress && progress.attemptCount > 0
            ? `Best: ${progress.bestScore ?? "—"} / ${progress.attemptCount} attempt${
                progress.attemptCount === 1 ? "" : "s"
              }`
            : "Not attempted"}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <Link
          href={`/incidents/${definition.slug}`}
          className="flex flex-1 items-center justify-center rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {definition.isFree ? "Start Incident" : "View Scenario"}
        </Link>
      </div>
    </article>
  );
}
