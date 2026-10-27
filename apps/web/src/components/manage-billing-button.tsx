"use client";

import { useState, useTransition } from "react";

/**
 * Opens the Stripe Billing Portal for the signed-in user (docs/
 * implementation_plan/phase9.md §21). The portal itself is already
 * configured in the Stripe TEST MODE dashboard — this button only
 * triggers session creation and follows the redirect.
 */
export function ManageBillingButton() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/stripe/customer-portal", { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error ?? "Failed to open billing portal");
        return;
      }
      window.location.href = data.url;
    });
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-md border border-border px-3 py-2 font-mono text-xs transition-colors hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Opening…" : "Manage Billing"}
      </button>
      {error && <p className="mt-2 text-xs text-[#dc2626]">{error}</p>}
    </div>
  );
}
