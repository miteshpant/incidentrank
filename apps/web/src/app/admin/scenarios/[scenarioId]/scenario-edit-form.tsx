"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = ["draft", "published", "archived"] as const;
const STRUCTURE_OPTIONS = ["linear", "branching", "parallel", "cascading"] as const;
const DOMAIN_OPTIONS = [
  "Databases & Storage",
  "Messaging & Streaming",
  "Caching",
  "Microservices & Dependencies",
  "API & Traffic",
  "Distributed Systems",
  "Deployments & Reliability",
  "Infrastructure & Capacity",
  "Security & Identity",
  "Data Pipelines",
] as const;

interface ScenarioEditFormInitial {
  isFree: boolean;
  isFreeOverriddenByAdmin: boolean;
  status: string;
  structure: string;
  domain: string | null;
  releaseWeek: string | null;
  publishedAt: string;
}

/**
 * Platform-admin scenario metadata editor (Phase 10G §2). Mirrors
 * CreditAdjustmentForm's shape: client form → PATCH → router.refresh().
 * Changing `isFree` always sets isFreeOverriddenByAdmin=true server-side
 * (see the API route) — this form surfaces that flag read-only so an
 * admin can see whether a row has already diverged from its code
 * default, and reset it back via the explicit "Reset to code default"
 * action rather than silently clearing it on every save.
 */
export function ScenarioEditForm({
  scenarioId,
  initial,
}: {
  scenarioId: string;
  initial: ScenarioEditFormInitial;
}) {
  const router = useRouter();
  const [isFree, setIsFree] = useState(initial.isFree);
  const [status, setStatus] = useState(initial.status);
  const [structure, setStructure] = useState(initial.structure);
  const [domain, setDomain] = useState(initial.domain ?? "");
  const [releaseWeek, setReleaseWeek] = useState(initial.releaseWeek ?? "");
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(body: Record<string, unknown>, successMessage: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/scenarios/${scenarioId}`, {
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

  function handleSave() {
    submit(
      {
        isFree,
        status,
        structure,
        domain: domain.length > 0 ? domain : null,
        releaseWeek: releaseWeek.trim().length > 0 ? releaseWeek.trim() : null,
        publishedAt: publishedAt.length > 0 ? new Date(publishedAt).toISOString() : null,
      },
      "Saved.",
    );
  }

  function handleResetFreeOverride() {
    submit({ isFreeOverriddenByAdmin: false }, "Free-tier override cleared — the next seed run will re-sync isFree from code.");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Free Tier</p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isFree}
            onChange={(e) => setIsFree(e.target.checked)}
          />
          Available in practice mode for free
        </label>
        {initial.isFreeOverriddenByAdmin && (
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wide text-amber-500">
              Overridden by admin — survives future seed runs
            </span>
            <button
              type="button"
              disabled={isPending}
              onClick={handleResetFreeOverride}
              className="rounded-md border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors hover:border-foreground/40 disabled:opacity-40"
            >
              Reset to code default
            </button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Status</p>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Structure</p>
        <select
          value={structure}
          onChange={(e) => setStructure(e.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {STRUCTURE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">Domain</p>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">—</option>
          {DOMAIN_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Release Week (editorial label)
        </p>
        <input
          type="text"
          value={releaseWeek}
          onChange={(e) => setReleaseWeek(e.target.value)}
          placeholder="e.g. 2026-W05"
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Published At (scheduling gate — blank means no schedule gate)
        </p>
        <input
          type="datetime-local"
          value={publishedAt}
          onChange={(e) => setPublishedAt(e.target.value)}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={handleSave}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
        {error && <p className="text-sm text-[#dc2626]">{error}</p>}
        {notice && <p className="text-sm text-muted">{notice}</p>}
      </div>
    </div>
  );
}
