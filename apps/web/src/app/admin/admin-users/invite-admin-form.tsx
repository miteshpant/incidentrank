"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function InviteAdminForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"owner" | "admin">("admin");
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInviteUrl(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/admin-users/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = (await response.json()) as { token?: string; error?: string };
      if (!response.ok || !data.token) {
        setError(data.error ?? "Failed to create invitation");
        return;
      }
      setInviteUrl(`${window.location.origin}/admin/invite/${data.token}`);
      setEmail("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label htmlFor="admin-invite-email" className="font-mono text-xs uppercase tracking-wide text-muted">
            Invite Admin (must be @incidentrank.com)
          </label>
          <input
            id="admin-invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="admin-invite-role" className="font-mono text-xs uppercase tracking-wide text-muted">
            Role
          </label>
          <select
            id="admin-invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as "owner" | "admin")}
            className="mt-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Inviting…" : "Invite"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}
      {inviteUrl && (
        <p className="mt-2 break-all font-mono text-xs text-muted">{inviteUrl}</p>
      )}
    </div>
  );
}
