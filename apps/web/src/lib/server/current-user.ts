import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { users, type User } from "@incidentrank/db";
import { db } from "./db";

/**
 * Returns the local IncidentRank user row for the signed-in Clerk identity,
 * creating it on first sight. Returns null when signed out. This is the
 * only place a Clerk identity is translated into a local user row — no
 * permanent "candidate" role, per docs/architecture.md principle 5.
 */
export async function getOrCreateCurrentUser(): Promise<User | null> {
  const { userId: authProviderId } = await auth();
  if (!authProviderId) return null;

  const existing = await db.query.users.findFirst({
    where: eq(users.authProviderId, authProviderId),
  });
  if (existing) return existing;

  const clerkUser = await currentUser();
  const displayName =
    clerkUser?.fullName ??
    clerkUser?.username ??
    clerkUser?.primaryEmailAddress?.emailAddress ??
    "Engineer";

  const [created] = await db
    .insert(users)
    .values({ authProviderId, displayName })
    .onConflictDoNothing({ target: users.authProviderId })
    .returning();

  if (created) return created;

  // Lost a race with a concurrent request creating the same user row.
  const row = await db.query.users.findFirst({
    where: eq(users.authProviderId, authProviderId),
  });
  if (!row) {
    throw new Error("Failed to create or find user after conflict");
  }
  return row;
}
