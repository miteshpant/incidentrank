import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@incidentrank/db";
import { db } from "./db";
import { createPrivacyRequest } from "./privacy-requests";

/**
 * Phase 10D §42/§43, confirmed product decision: real self-service
 * account deletion via anonymization, not a manual-only record. Inside
 * one transaction:
 *
 *   1. Scrambles users.displayName to a non-identifying placeholder.
 *   2. Scrambles users.authProviderId to a value that can never match a
 *      real Clerk identity again — this is the join key
 *      getOrCreateCurrentUser() uses, so this is what actually "revokes
 *      the local auth linkage": the user's Clerk session can no longer
 *      resolve to a usable IncidentRank account (a fresh
 *      getOrCreateCurrentUser() call for that Clerk identity would
 *      create a brand-new row rather than ever finding this one again).
 *   3. Flips leaderboardVisible to false so an anonymized account can
 *      never remain publicly listed.
 *   4. Writes a privacy_requests row (requestType="deletion",
 *      status="completed", completed synchronously).
 *
 * Deliberately does NOT touch organizationMembers, attempts (practice or
 * assessment), rankSnapshots, organizationCreditLedger,
 * paidEntitlements/stripeSubscriptions, referrals, legalAcceptances, or
 * any audit-event row — all of these remain, pointed at this now-
 * anonymized user id, per spec §42/§63's explicit "prefer anonymization
 * over destructive removal when organizational integrity, financial
 * record-keeping, or legal acceptance evidence must remain intact."
 * legalAcceptances in particular must never be deleted — deleting it
 * would destroy the very evidence that consent was once given.
 */
export async function deleteOwnAccount(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const anonymizedSuffix = `deleted-${userId}`;

    await tx
      .update(users)
      .set({
        displayName: "Deleted User",
        authProviderId: `anonymized_${anonymizedSuffix}`,
        leaderboardVisible: false,
      })
      .where(eq(users.id, userId));

    await createPrivacyRequest(userId, "deletion", { status: "completed", tx });
  });
}
