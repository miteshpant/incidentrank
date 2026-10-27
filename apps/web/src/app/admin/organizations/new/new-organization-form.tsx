"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

interface CreateResult {
  organization: { id: string; name: string; slug: string };
  invitation: { email: string; expiresAt: string };
  inviteUrl: string;
  emailSent: boolean;
}

export function NewOrganizationForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug.trim().length > 0 ? slug : undefined,
          ownerEmail,
          notes: notes.trim().length > 0 ? notes : undefined,
        }),
      });
      const data = (await response.json()) as Partial<CreateResult> & { error?: string };
      if (!response.ok || !data.organization || !data.invitation) {
        setError(data.error ?? "Failed to create organization");
        return;
      }
      setResult(data as CreateResult);
    });
  }

  if (result) {
    return (
      <div className="rounded-md border border-border bg-surface p-4 text-sm">
        <p>
          Organization <strong>{result.organization.name}</strong> created with status{" "}
          <span className="font-mono text-xs uppercase text-muted">pending</span>.
        </p>
        <p className="mt-2">
          Owner invitation {result.emailSent ? "sent" : "created but email delivery failed"} to{" "}
          {result.invitation.email}.
        </p>
        {!result.emailSent && (
          <div className="mt-2 rounded-md border border-border bg-background p-3">
            <p className="text-xs text-[#dc2626]">
              Email delivery failed — share this invite link with the owner directly:
            </p>
            <code className="mt-2 block break-all font-mono text-xs text-muted">{result.inviteUrl}</code>
          </div>
        )}
        <Link
          href={`/admin/organizations/${result.organization.id}`}
          className="mt-4 inline-block rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          View Organization
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label htmlFor="org-name" className="font-mono text-xs uppercase tracking-wide text-muted">
          Organization Name
        </label>
        <input
          id="org-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="org-slug" className="font-mono text-xs uppercase tracking-wide text-muted">
          Slug (optional — derived from name if blank)
        </label>
        <input
          id="org-slug"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="org-owner-email" className="font-mono text-xs uppercase tracking-wide text-muted">
          Initial Owner Email
        </label>
        <input
          id="org-owner-email"
          type="email"
          required
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label htmlFor="org-notes" className="font-mono text-xs uppercase tracking-wide text-muted">
          Internal Notes (optional)
        </label>
        <textarea
          id="org-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Creating…" : "Create Organization"}
      </button>
      {error && <p className="text-sm text-[#dc2626]">{error}</p>}
    </form>
  );
}
