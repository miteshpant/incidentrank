"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type InviteableRole = "owner" | "admin" | "member";

interface InviteMemberFormProps {
  slug: string;
  /**
   * The inviting member's own role — presentational only (hides the
   * "Owner" option for non-owners). The real authorization boundary is
   * server-side canInviteRole, enforced in the invitations route.
   */
  actorRole: InviteableRole;
}

export function InviteMemberForm({ slug, actorRole }: InviteMemberFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteableRole>("member");
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
        const response = await fetch(`/api/organizations/${slug}/members/invitations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, role }),
        });
        const data = (await response.json()) as { token?: string; error?: string };
        if (!response.ok || !data.token) {
          setError(data.error ?? "Failed to create invitation");
          return;
        }
        setInviteUrl(`${window.location.origin}/organization/invite/${data.token}`);
        setEmail("");
        setRole("member");
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
          <label htmlFor="invite-email" className="font-mono text-xs uppercase tracking-wide text-muted">
            Invite Member
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@example.com"
            className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          />
        </div>
        <div>
          <label htmlFor="invite-role" className="font-mono text-xs uppercase tracking-wide text-muted">
            Role
          </label>
          <select
            id="invite-role"
            value={role}
            onChange={(event) => setRole(event.target.value as InviteableRole)}
            className="mt-2 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            {actorRole === "owner" && <option value="owner">Owner</option>}
          </select>
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
          <code className="flex-1 truncate font-mono text-xs text-muted">{inviteUrl}</code>
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
