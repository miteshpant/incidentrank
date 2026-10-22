"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function NewOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/organizations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const data = (await response.json()) as {
          organization?: { slug: string };
          error?: string;
        };
        if (!response.ok || !data.organization) {
          setError(data.error ?? "Failed to create organization");
          return;
        }
        router.push(`/organizations/${data.organization.slug}`);
      } catch {
        setError("Failed to create organization");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
      <div>
        <label htmlFor="org-name" className="font-mono text-xs uppercase tracking-wide text-muted">
          Organization Name
        </label>
        <input
          id="org-name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Corp"
          className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-foreground/40"
        />
      </div>

      {error && <p className="text-sm text-[#dc2626]">{error}</p>}

      <button
        type="submit"
        disabled={isPending || name.trim().length === 0}
        className="self-start rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create Organization"}
      </button>
    </form>
  );
}
