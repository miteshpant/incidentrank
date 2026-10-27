"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Platform-admin credit adjustment control (docs/implementation_plan/
 * phase10b.md §39/§40). Requires a non-zero integer quantity and a
 * non-empty reason before the request is even sent — server-side
 * validation (the route itself) remains authoritative, this is purely a
 * UX guard.
 */
export function CreditAdjustmentForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    setNotice(null);
    const parsed = Number.parseInt(quantity, 10);
    if (!Number.isFinite(parsed) || parsed === 0) {
      setError("Enter a non-zero integer quantity (e.g. 1 or -1)");
      return;
    }
    if (reason.trim().length === 0) {
      setError("A reason is required");
      return;
    }
    startTransition(async () => {
      const response = await fetch(
        `/api/admin/organizations/${organizationId}/credits/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: parsed, reason: reason.trim() }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Adjustment failed");
        return;
      }
      setNotice(`Adjustment of ${parsed > 0 ? `+${parsed}` : parsed} recorded.`);
      setQuantity("");
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
        Adjust Credits
      </p>
      <div className="mt-3 flex gap-3">
        <input
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="+1 or -1"
          className="w-28 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}
      {notice && <p className="mt-2 text-sm text-muted">{notice}</p>}
    </div>
  );
}
