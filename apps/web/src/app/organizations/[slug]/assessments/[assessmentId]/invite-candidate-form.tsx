"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface InviteCandidateFormProps {
  slug: string;
  assessmentId: string;
}

export function InviteCandidateForm({ slug, assessmentId }: InviteCandidateFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    setCopied(false);

    startTransition(async () => {
      try {
        const response = await fetch(
          `/api/organizations/${slug}/assessments/${assessmentId}/candidates`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          },
        );
        const data = (await response.json()) as {
          inviteUrl?: string;
          error?: string;
        };
        if (!response.ok || !data.inviteUrl) {
          setError(data.error ?? "Failed to create invitation");
          return;
        }
        setInviteUrl(`${window.location.origin}${data.inviteUrl}`);
        setEmail("");
        router.refresh();
      } catch {
        setError("Failed to create invitation");
      }
    });
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
  };

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="candidate-email" className="font-mono text-xs uppercase tracking-wide text-muted">
            Invite Candidate
          </label>
          <input
            id="candidate-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="candidate@example.com"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <button
          type="submit"
          disabled={isPending || email.trim().length === 0}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Inviting…" : "Invite"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-[#dc2626]">{error}</p>}

      {inviteUrl && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-background p-3">
          <code className="flex-1 truncate font-mono text-xs text-muted">
            {inviteUrl}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded border border-border px-2 py-1 font-mono text-xs transition-colors hover:border-foreground/40"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
