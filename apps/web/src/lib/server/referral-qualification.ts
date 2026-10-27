import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { referrals } from "@incidentrank/db";
import { db } from "./db";
import { grantIncidentPass, findPassBySource } from "./incident-passes";
import { sendReferralRewardEmail } from "./email";
import { isReferralsEnabled } from "./feature-flags";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export interface QualifyReferralInput {
  attemptId: string;
  userId: string;
  incidentPassId: string | null;
  outcome: "resolved" | "failed" | "declared_unstable" | "timed_out";
  completionTier: "optimal" | "acceptable" | null;
}

/**
 * The exact referral qualification/reward chain, called from
 * persistTerminalAttempt for every terminal attempt (both automatic and
 * candidate-declared). This is corrected per docs/implementation_plan/
 * phase8loc.md's "Referral qualification must follow pass lineage" — the
 * qualifying chain is:
 *
 *   Referral -> referredIncidentPassId -> attempt.incidentPassId
 *     -> resolved ACCEPTABLE/OPTIMAL -> reward
 *
 * Only the attempt funded by the referral-created Incident Pass may
 * qualify that referral — NOT merely "this attempt belongs to a user
 * with a claimed referral." A referred user's unrelated free-scenario or
 * other-pass-funded resolution must never trigger a reward. This is
 * mandatory, not an optimization.
 *
 * Idempotency/concurrency: the UPDATE below is scoped to
 * `WHERE status = 'claimed'` (never re-qualify an already-qualified/
 * rewarded referral) and relies on referrals.qualifying_attempt_id's
 * unique partial index as the final backstop — even if this function
 * were somehow invoked twice for the same attempt, the second call's
 * UPDATE would affect zero rows.
 */
export async function qualifyReferralForAttempt(
  tx: TxOrDb,
  input: QualifyReferralInput,
): Promise<void> {
  if (!isReferralsEnabled()) return;

  // Only a resolved, acceptable-or-optimal outcome can ever qualify a
  // referral — failed/declared_unstable/timed_out never do, regardless
  // of pass lineage.
  if (input.outcome !== "resolved") return;
  if (input.completionTier !== "acceptable" && input.completionTier !== "optimal") return;

  // An attempt not funded by any Incident Pass can never qualify a
  // referral — this is the lineage anchor itself.
  if (!input.incidentPassId) return;

  const referral = await tx.query.referrals.findFirst({
    where: and(
      eq(referrals.referredIncidentPassId, input.incidentPassId),
      eq(referrals.status, "claimed"),
    ),
  });
  if (!referral) return;

  // Defensive, should already be guaranteed by the referredIncidentPassId
  // match above, but never reward a referral whose referredUserId
  // doesn't match the attempt's actual owner.
  if (referral.referredUserId !== input.userId) return;

  const [qualified] = await tx
    .update(referrals)
    .set({
      status: "qualified",
      qualifyingAttemptId: input.attemptId,
      qualifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(referrals.id, referral.id), eq(referrals.status, "claimed")))
    .returning();

  // Another concurrent terminal-persistence call already qualified this
  // referral first — never reward twice.
  if (!qualified) return;

  // sourceId is deliberately the qualifying ATTEMPT's id, not the
  // referral's id: claimReferral already uses sourceType="referral_reward"
  // + sourceId=referral.id for the referred user's claim pass, and
  // incident_passes_source_idx's uniqueness is on (sourceType, sourceId)
  // — reusing referral.id here would collide with that row under the
  // same unique index and make the reward grant silently resolve to the
  // referred user's own claim pass via the onConflictDoNothing fallback
  // (a real bug caught live in Phase 8 QA-12: the referrer received
  // nothing while the referral was incorrectly marked "rewarded"). The
  // attempt id is unique per qualification and never collides with any
  // promo-invite or claim-pass sourceId.
  const rewardPass =
    (await grantIncidentPass(tx, {
      userId: qualified.referrerUserId,
      sourceType: "referral_reward",
      sourceId: input.attemptId,
    })) ?? (await findPassBySource("referral_reward", input.attemptId));
  if (!rewardPass) {
    throw new Error("Failed to grant reward Incident Pass for qualified referral");
  }

  const [rewarded] = await tx
    .update(referrals)
    .set({
      status: "rewarded",
      rewardIncidentPassId: rewardPass.id,
      rewardedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(referrals.id, qualified.id), isNull(referrals.rewardedAt)))
    .returning();

  if (rewarded) {
    const referrer = await tx.query.users.findFirst({
      where: (table, { eq: eqFn }) => eqFn(table.id, qualified.referrerUserId),
    });
    if (referrer) {
      // Deliberately NOT awaited: this is a network call to both Clerk
      // (resolve the referrer's email) and Resend, and must never hold
      // the enclosing DB transaction open or risk rolling back an
      // already-durable reward over a flaky email provider. Reward
      // issuance (the measurable, tested guarantee) is complete the
      // moment the UPDATE above commits; the notification email is
      // best-effort on top of that, matching "sent = provider accepted
      // request" (phase8loc.md Step 12A) — never a correctness
      // requirement for the reward itself.
      void sendReferralRewardNotification(referrer.authProviderId);
    }
  }
}

async function sendReferralRewardNotification(referrerAuthProviderId: string): Promise<void> {
  try {
    const client = await clerkClient();
    const clerkUser = await client.users.getUser(referrerAuthProviderId);
    const email = clerkUser.emailAddresses.find(
      (addr) => addr.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress;
    if (!email) return;
    await sendReferralRewardEmail({ to: email, passCount: 1 });
  } catch {
    // Best-effort — never throw out of a fire-and-forget notification.
  }
}
