"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface AdminUserRowProps {
  adminUserId: string;
  displayName: string;
  role: string;
  isSelf: boolean;
}

export function AdminUserRow({ adminUserId, displayName, role, isSelf }: AdminUserRowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRevoke() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/admin-users/${adminUserId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Failed to revoke");
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between rounded-md border border-border px-4 py-2 text-sm">
      <span>
        {displayName} {isSelf && <span className="text-muted">(you)</span>}
      </span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted">{role}</span>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={isPending}
          className="rounded border border-border px-2 py-1 font-mono text-xs text-muted transition-colors hover:border-[#dc2626] hover:text-[#dc2626] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
      {error && <p className="text-xs text-[#dc2626]">{error}</p>}
    </li>
  );
}
