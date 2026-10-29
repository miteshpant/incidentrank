"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface PrivacyRequestStatusControlProps {
  requestId: string;
}

export function PrivacyRequestStatusControl({ requestId }: PrivacyRequestStatusControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function markCompleted() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/privacy-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (response.ok) {
        router.refresh();
      } else {
        setError("Failed");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={markCompleted}
        className="rounded-md border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-wide transition-colors hover:border-foreground/40 disabled:opacity-40"
      >
        Mark Completed
      </button>
      {error && <span className="text-[10px] text-[#dc2626]">{error}</span>}
    </div>
  );
}
