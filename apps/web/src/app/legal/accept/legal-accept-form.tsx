"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Phase 10D (phasse10d.md §18/§56). Checkbox starts unchecked, submit is
 * disabled until checked — never implied from merely reaching this page.
 * Deliberately shows ONLY the Terms/Privacy acceptance control — the
 * leaderboard opt-in toggle lives solely on /profile and is never
 * rendered or bundled here (§13/§56: "Terms acceptance must NOT
 * automatically enable leaderboard participation" / "do not combine
 * leaderboard opt-in with Terms").
 */
export function LegalAcceptForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/legal/accept", { method: "POST" });
      if (response.ok) {
        router.push("/profile");
        router.refresh();
      } else {
        setError("Could not record your acceptance. Please try again.");
      }
    });
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className="underline">
            Terms of Service
          </Link>{" "}
          and acknowledge the{" "}
          <Link href="/privacy" target="_blank" className="underline">
            Privacy Policy
          </Link>
          .
        </span>
      </label>

      <button
        type="button"
        disabled={!checked || isPending}
        onClick={submit}
        className="w-fit rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue
      </button>

      {error && <p className="font-mono text-xs text-red-600">{error}</p>}
    </div>
  );
}
