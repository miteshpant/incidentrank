import "server-only";
import { currentUser } from "@clerk/nextjs/server";

/**
 * The signed-in Clerk identity's verified primary email, or null if none
 * exists (unverified, or no primary email set). Factored out of the
 * assessment-invite/organization-invite accept routes' identical inline
 * logic — Phase 8's admin bootstrap, admin-invite acceptance, and
 * promotional-invite redemption all need this same "verified email the
 * invite/bootstrap check is matched against" extraction.
 */
export async function getVerifiedPrimaryEmail(): Promise<string | null> {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;
  return (
    clerkUser.emailAddresses.find(
      (addr) =>
        addr.id === clerkUser.primaryEmailAddressId &&
        addr.verification?.status === "verified",
    )?.emailAddress ?? null
  );
}
