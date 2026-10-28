import "server-only";
import { clerkClient } from "@clerk/nextjs/server";

/**
 * Phase 10C customer/revenue dashboard — Clerk email resolution helpers
 * (docs/implementation_plan/phase10c.md §27/§31). `users` has no email
 * column of its own (identity lives in Clerk, per docs/architecture.md
 * and the established pattern in organization-provisioning.ts/
 * org-membership.ts). Every lookup here is batched — never called once
 * per row in a loop — since the dashboard's user list page may render up
 * to a page (50) of rows at once.
 */

/**
 * Resolves each authProviderId's current primary email in one batched
 * Clerk call. A failed or missing lookup maps to null rather than
 * throwing — a Clerk outage must never break the customer list page,
 * only degrade individual rows to a blank email cell (mirrors the
 * fire-and-forget-never-throws convention established in
 * organization-provisioning.ts's resolveEmailForNotification).
 */
export async function resolveEmailsForUsers(
  authProviderIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (authProviderIds.length === 0) return result;

  for (const id of authProviderIds) result.set(id, null);

  try {
    const client = await clerkClient();
    const response = await client.users.getUserList({ userId: authProviderIds, limit: authProviderIds.length });
    for (const clerkUser of response.data) {
      const primary =
        clerkUser.emailAddresses.find((addr) => addr.id === clerkUser.primaryEmailAddressId)
          ?.emailAddress ?? null;
      result.set(clerkUser.id, primary);
    }
  } catch {
    // Already defaulted to null above — a Clerk failure degrades to
    // blank emails, never breaks the page.
  }

  return result;
}

/**
 * Reverse lookup: given an email, returns every Clerk authProviderId
 * matching it exactly (Clerk's own getUserList email filter is
 * exact-match only, not substring search — this function inherits that
 * boundary rather than attempting local substring matching, documented
 * as a V1 simplification in the Phase 10C completion report). Callers
 * then filter the local `users` table by `authProviderId IN (...)`.
 * Returns an empty array (never throws) on a Clerk lookup failure.
 */
export async function findAuthProviderIdsByEmail(email: string): Promise<string[]> {
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return [];

  try {
    const client = await clerkClient();
    const response = await client.users.getUserList({ emailAddress: [normalized] });
    return response.data.map((u) => u.id);
  } catch {
    return [];
  }
}
