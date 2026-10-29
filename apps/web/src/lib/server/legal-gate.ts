import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@incidentrank/db";
import { requireCurrentLegalAcceptance } from "./legal-acceptance";

/**
 * Phase 10D (phasse10d.md §19). Call this from a page server component
 * right after resolving the current user, for every "real product
 * access" page (profile, organizations, attempts — not /terms, /privacy,
 * /legal/accept, or admin routes, which are either always-reachable or
 * already gated by a stronger check). Redirects via Next's redirect()
 * (throws internally) rather than returning a value the caller must
 * remember to act on — matches this codebase's `notFound()`-as-gate
 * convention (admin-dashboard.tsx, org-dashboard.tsx) generalized from
 * "hide" to "redirect."
 */
export async function enforceLegalGate(user: User): Promise<void> {
  const result = await requireCurrentLegalAcceptance(user);
  if (!result.ok) {
    redirect(result.redirectTo);
  }
}
