import "server-only";
import { eq, sql } from "drizzle-orm";
import { adminUsers, type AdminUser, type User } from "@incidentrank/db";
import { db } from "./db";

export type BootstrapOwnerResult =
  | { ok: true; membership: AdminUser; justBootstrapped: boolean }
  | { ok: false; reason: "wrong_email" | "already_bootstrapped" };

/**
 * Implements the first-owner bootstrap flow (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.1, corrected by
 * phase8loc.md's "Step 2 — First admin bootstrap"):
 *
 *   authenticated user with verified email
 *     -> exact (never normalized) match against INITIAL_ADMIN_EMAIL
 *     -> no owner has ever been bootstrapped
 *     -> create owner membership
 *     -> bootstrap permanently closes
 *
 * "Permanently closes" means: once any owner row exists, bootstrap can
 * never run again — even if that owner is later revoked. This is a
 * one-time event, not "ensure an owner always exists," so the check does
 * NOT filter revokedAt.
 *
 * Race-safety (phase8loc.md Step 2A): two simultaneous first-bootstrap
 * requests must not create two owners. This relies on the DB-level
 * `admin_users_single_owner_idx` partial unique index on
 * (role) WHERE role = 'owner' — at most one such row can ever exist, full
 * stop. The INSERT uses onConflictDoNothing targeting that index; a
 * request that loses the race gets back zero rows and re-queries to
 * confirm bootstrap already happened (by someone else), returning a
 * clean "already_bootstrapped" rather than throwing.
 */
export async function bootstrapOwnerIfEligible(
  user: User,
  verifiedEmail: string | null,
): Promise<BootstrapOwnerResult> {
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL ?? "mpant@incidentrank.com";

  // Exact string match only — never normalized/plus-address logic here.
  // If a test/dev environment's Clerk test-mode identity can't obtain
  // this exact literal, override INITIAL_ADMIN_EMAIL for that
  // environment instead (phase8loc.md: "do not add special plus-address
  // logic to production code").
  if (verifiedEmail !== initialAdminEmail) {
    return { ok: false, reason: "wrong_email" };
  }

  const existingOwner = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.role, "owner"),
  });
  if (existingOwner) {
    if (existingOwner.userId === user.id) {
      return { ok: true, membership: existingOwner, justBootstrapped: false };
    }
    return { ok: false, reason: "already_bootstrapped" };
  }

  const [created] = await db
    .insert(adminUsers)
    .values({ userId: user.id, role: "owner", createdByUserId: null })
    // The conflict target must exactly match admin_users_single_owner_idx's
    // partial predicate, or Postgres rejects the clause entirely with "no
    // unique or exclusion constraint matching the ON CONFLICT
    // specification" — confirmed directly against the dev DB.
    .onConflictDoNothing({
      target: adminUsers.role,
      where: sql`${adminUsers.role} = 'owner'`,
    })
    .returning();

  if (created) {
    return { ok: true, membership: created, justBootstrapped: true };
  }

  // Lost the bootstrap race to a concurrent request — re-query to report
  // the (now-existing) owner state rather than throwing.
  const row = await db.query.adminUsers.findFirst({
    where: eq(adminUsers.role, "owner"),
  });
  if (!row) {
    throw new Error("Bootstrap insert conflicted but no owner row found");
  }
  if (row.userId === user.id) {
    return { ok: true, membership: row, justBootstrapped: false };
  }
  return { ok: false, reason: "already_bootstrapped" };
}
