"use client";

import { useState, useTransition } from "react";

interface OrgCheckoutButtonProps {
  slug: string;
  plan: "single_credit" | "credit_pack_110";
  label: string;
}

/**
 * Starts a Stripe Checkout Session for an organization assessment
 * credit purchase (docs/implementation_plan/phase10b.md §35). Mirrors
 * the personal CheckoutButton's pattern exactly — the server is the
 * sole source of truth for price IDs; this component only posts the
 * plan string and follows the redirect.
 */
export function OrgCheckoutButton({ slug, plan, label }: OrgCheckoutButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/organizations/${slug}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !data.url) {
        setError(data.error ?? "Failed to start checkout");
        return;
      }
      window.location.href = data.url;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}
    </div>
  );
}
