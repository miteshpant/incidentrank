"use client";

import Link from "next/link";
import { SignedOut, SignUpButton, useAuth } from "@clerk/nextjs";
import { trackEvent } from "@/lib/analytics";

/**
 * Client-only piece of the homepage: the primary "Try a Free Incident"
 * CTA (tracked) plus a visually secondary "Create Account" action that
 * never renders for an already-authenticated visitor (spec: "If the user
 * is already authenticated, do not show unnecessary signup messaging").
 */
export function HomeCtaRow() {
  const { isLoaded, isSignedIn } = useAuth();

  return (
    <div className="mt-10 flex flex-wrap items-center gap-4">
      <Link
        href="/incidents"
        onClick={() => trackEvent("try_free_incident_clicked")}
        className="inline-flex items-center rounded-md border border-border bg-foreground px-5 py-3 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Try a Free Incident
      </Link>

      {isLoaded && !isSignedIn && (
        <SignedOut>
          <SignUpButton mode="modal">
            <button
              type="button"
              onClick={() => trackEvent("signup_clicked")}
              className="inline-flex items-center rounded-md border border-border px-5 py-3 font-mono text-sm text-muted transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              Create Account
            </button>
          </SignUpButton>
        </SignedOut>
      )}
    </div>
  );
}
