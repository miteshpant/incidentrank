"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface InvitationRowProps {
  slug: string;
  invitation: {
    id: string;
    email: string;
    role: "owner" | "admin" | "member";
    expiresAt: string;
  };
  canManage: boolean;
}

const ROLE_LABEL: Record<"owner" | "admin" | "member", string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * The plaintext invite token is only ever returned once, at creation
 * time (see InviteMemberForm's own "Copy Invitation Link" display) —
 * it is never stored or retrievable again, so a pending invitation row
 * re-rendered here (e.g. after navigating back to this page) has no
 * token to copy. This row therefore only offers Revoke, never a copy
 * action — there is nothing left to copy once the creation response is
 * gone.
 */
export function InvitationRow({ slug, invitation, canManage }: InvitationRowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRevoke = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        `/api/organizations/${slug}/members/invitations/${invitation.id}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to revoke invitation");
        return;
      }
      router.refresh();
    });
  };

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-3 pr-4">{invitation.email}</td>
      <td className="py-3 pr-4 font-mono text-xs">{ROLE_LABEL[invitation.role]}</td>
      <td className="py-3 pr-4 font-mono text-xs text-muted">
        {new Date(invitation.expiresAt).toLocaleDateString()}
      </td>
      {canManage && (
        <td className="py-3 pr-4">
          <button
            type="button"
            disabled={isPending}
            onClick={handleRevoke}
            className="rounded border border-border px-2 py-1 font-mono text-[10px] text-[#dc2626] transition-colors hover:border-[#dc2626]"
          >
            Revoke
          </button>
          {error && <p className="mt-1 text-[10px] text-[#dc2626]">{error}</p>}
        </td>
      )}
    </tr>
  );
}
