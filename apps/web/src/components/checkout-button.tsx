"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface CheckoutButtonProps {
  plan: "pro_monthly" | "pro_annual" | "founding_lifetime";
  label: string;
  disabled?: boolean;
  signedIn: boolean;
}

/**
 * Starts a Stripe Checkout Session for the given plan and redirects to
 * the returned URL (docs/implementation_plan/phase9.md §13/§17). The
 * server is the sole source of truth for plan eligibility/price IDs —
 * this component only posts the plan string and follows the redirect.
 */
export function CheckoutButton({ plan, label, disabled, signedIn }: CheckoutButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!signedIn) {
      router.push("/profile?next=/pricing");
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
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
        disabled={disabled || isPending}
        className="w-full rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Redirecting…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-[#dc2626]">{error}</p>}
    </div>
  );
}
