"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OrgRole = "owner" | "admin" | "member";

interface MemberRowProps {
  slug: string;
  member: {
    id: string;
    role: OrgRole;
    createdAt: string;
    displayName: string;
  };
  currentUserRole: OrgRole;
  currentUserMemberId: string;
  ownerCount: number;
}

const ROLE_LABEL: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

/**
 * Role changes are owner-only (canChangeRole), and removal follows
 * canManageMember (owner → admin/member/owner; admin → member only).
 * The last-owner invariant is always enforced server-side regardless of
 * what this component shows/hides — disabling a control here is a
 * convenience, never the actual guard.
 */
export function MemberRow({
  slug,
  member,
  currentUserRole,
  currentUserMemberId,
  ownerCount,
}: MemberRowProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSoleOwner = member.role === "owner" && ownerCount <= 1;
  const canChangeRole = currentUserRole === "owner";
  const canRemove =
    currentUserRole === "owner"
      ? true
      : currentUserRole === "admin"
        ? member.role === "member"
        : false;

  const changeRole = (nextRole: OrgRole) => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/organizations/${slug}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to change role");
        return;
      }
      router.refresh();
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/organizations/${slug}/members/${member.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Failed to remove member");
        return;
      }
      router.refresh();
    });
  };

  const showActions = canChangeRole || canRemove;

  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-3 pr-4">
        {member.displayName}
        {member.id === currentUserMemberId && (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-wide text-muted">you</span>
        )}
      </td>
      <td className="py-3 pr-4 font-mono text-xs">{ROLE_LABEL[member.role]}</td>
      <td className="py-3 pr-4 font-mono text-xs text-muted">
        {new Date(member.createdAt).toLocaleDateString()}
      </td>
      {showActions && (
        <td className="py-3 pr-4">
          <div className="flex flex-wrap items-center gap-2">
            {canChangeRole && member.role === "member" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => changeRole("admin")}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40 disabled:opacity-50"
              >
                Make Admin
              </button>
            )}
            {canChangeRole && member.role === "admin" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => changeRole("member")}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40 disabled:opacity-50"
              >
                Make Member
              </button>
            )}
            {canChangeRole && member.role !== "owner" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => changeRole("owner")}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40 disabled:opacity-50"
              >
                Make Owner
              </button>
            )}
            {canChangeRole && member.role === "owner" && !isSoleOwner && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => changeRole("admin")}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] transition-colors hover:border-foreground/40 disabled:opacity-50"
              >
                Demote to Admin
              </button>
            )}
            {canRemove && !isSoleOwner && (
              <button
                type="button"
                disabled={isPending}
                onClick={remove}
                className="rounded border border-border px-2 py-1 font-mono text-[10px] text-[#dc2626] transition-colors hover:border-[#dc2626]"
              >
                Remove
              </button>
            )}
            {isSoleOwner && (
              <span className="font-mono text-[10px] text-muted">last owner</span>
            )}
          </div>
          {error && <p className="mt-1 text-[10px] text-[#dc2626]">{error}</p>}
        </td>
      )}
    </tr>
  );
}
