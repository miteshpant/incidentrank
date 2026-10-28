"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useAuth,
} from "@clerk/nextjs";

/**
 * Only fetched when signed in, and only to decide whether to show the
 * "Organizations" nav link at all — per Phase 4's instruction not to
 * clutter navigation for users who belong to no organizations.
 */
function useHasOrganizations(isSignedIn: boolean | undefined): boolean {
  const [hasOrganizations, setHasOrganizations] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return undefined;

    let cancelled = false;
    fetch("/api/organizations")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { organizations?: unknown[] } | null) => {
        if (!cancelled) setHasOrganizations((data?.organizations?.length ?? 0) > 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  return isSignedIn ? hasOrganizations : false;
}

export function SiteHeader() {
  const { isSignedIn } = useAuth();
  const hasOrganizations = useHasOrganizations(isSignedIn);

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="font-mono text-sm font-semibold tracking-tight"
        >
          IncidentRank
        </Link>

        <nav className="flex items-center gap-5 font-mono text-xs">
          <Link href="/incidents" className="text-muted hover:text-foreground">
            Incidents
          </Link>
          <Link href="/leaderboard" className="text-muted hover:text-foreground">
            Leaderboard
          </Link>
          <SignedIn>
            <Link href="/attempts" className="text-muted hover:text-foreground">
              Attempts
            </Link>
            {hasOrganizations && (
              <Link href="/organizations" className="text-muted hover:text-foreground">
                Organizations
              </Link>
            )}
            <Link href="/profile" className="text-muted hover:text-foreground">
              Profile
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded border border-border px-3 py-1.5 text-muted hover:border-foreground/40 hover:text-foreground"
              >
                Sign in
              </button>
            </SignInButton>
          </SignedOut>
        </nav>
      </div>
    </header>
  );
}
