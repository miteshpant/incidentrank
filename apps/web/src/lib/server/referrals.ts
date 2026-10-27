import "server-only";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { attempts, incidentPasses, referrals, type Referral, type User } from "@incidentrank/db";
import { db } from "./db";
import { generateInviteToken } from "./invite-token";
import { grantIncidentPass } from "./incident-passes";

const REFERRAL_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Whether `user` has at least one eligible completed promo/referral
 * incident — the gate for becoming a referrer (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §14: "After the user's
 * first eligible completed promo/referral incident"). Scoped to a
 * resolved, acceptable-or-optimal attempt funded by an Incident Pass
 * (any sourceType) — a free-scenario completion does not qualify, since
 * referral capability is specifically a reward for engaging with the
 * promotional/referral access loop, not practice-mode usage in general.
 */
export async function isEligibleToReferOthers(userId: string): Promise<boolean> {
  const qualifyingAttempt = await db.query.attempts.findFirst({
    where: and(
      eq(attempts.userId, userId),
      eq(attempts.status, "completed"),
      eq(attempts.outcome, "resolved"),
      or(eq(attempts.completionTier, "acceptable"), eq(attempts.completionTier, "optimal")),
    ),
    with: { incidentPass: true },
  });
  return qualifyingAttempt?.incidentPassId != null;
}

/** The referrer's existing referral code, if one has already been created. */
export async function findExistingReferralCode(
  referrerUserId: string,
): Promise<Referral | null> {
  const row = await db.query.referrals.findFirst({
    where: and(eq(referrals.referrerUserId, referrerUserId), isNull(referrals.referredUserId)),
  });
  return row ?? null;
}

export interface CreateReferralCodeResult {
  referral: Referral;
  code: string;
}

/**
 * Creates (or returns the existing) referral code for an eligible
 * referrer. Idempotent: a referrer who already has an unclaimed code
 * gets that same code back rather than a second one, keeping "copy my
 * referral link" stable across visits — the code is stored in plaintext
 * (see the schema comment on referrals.referralCode) specifically so it
 * CAN be recovered and re-displayed on every profile visit, unlike a
 * one-time-reveal invite token.
 */
export async function createReferralCode(
  referrerUserId: string,
): Promise<CreateReferralCodeResult | null> {
  const eligible = await isEligibleToReferOthers(referrerUserId);
  if (!eligible) return null;

  const existing = await findExistingReferralCode(referrerUserId);
  if (existing) {
    return { referral: existing, code: existing.referralCode };
  }

  const code = generateInviteToken();
  const [referral] = await db
    .insert(referrals)
    .values({
      referralCode: code,
      referrerUserId,
      expiresAt: new Date(Date.now() + REFERRAL_EXPIRY_MS),
    })
    .returning();
  if (!referral) throw new Error("Failed to create referral code");

  return { referral, code };
}

export type LoadReferralResult =
  | { ok: true; referral: Referral }
  | { ok: false; reason: "not_found" };

export async function loadReferralByCode(code: string): Promise<LoadReferralResult> {
  const referral = await db.query.referrals.findFirst({
    where: eq(referrals.referralCode, code),
  });
  if (!referral) return { ok: false, reason: "not_found" };
  return { ok: true, referral };
}

export type ReferralEligibilityResult =
  | { eligible: true }
  | {
      eligible: false;
      reason:
        | "self_referral"
        | "already_attached_to_referral"
        | "already_consumed_a_pass"
        | "already_completed_a_practice_incident";
    };

/**
 * Central referral-eligibility policy (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §17/§18, phase8loc.md
 * Step 8's "one central function" requirement — every claim-path call
 * site uses this, never a duplicated inline check). V1 existing-user
 * policy: a user may be acquired through at most one referral ever, and
 * only if they have never consumed a promotional/referral Incident Pass
 * and never completed a practice incident before.
 */
export async function evaluateReferralEligibility(
  referral: Referral,
  candidateUserId: string,
): Promise<ReferralEligibilityResult> {
  if (candidateUserId === referral.referrerUserId) {
    return { eligible: false, reason: "self_referral" };
  }

  const alreadyAttached = await db.query.referrals.findFirst({
    where: and(eq(referrals.referredUserId, candidateUserId), ne(referrals.id, referral.id)),
  });
  if (alreadyAttached) {
    return { eligible: false, reason: "already_attached_to_referral" };
  }

  const consumedPass = await db.query.incidentPasses.findFirst({
    where: and(
      eq(incidentPasses.userId, candidateUserId),
      or(eq(incidentPasses.status, "bound"), eq(incidentPasses.status, "consumed")),
    ),
  });
  if (consumedPass) {
    return { eligible: false, reason: "already_consumed_a_pass" };
  }

  const priorAttempt = await db.query.attempts.findFirst({
    where: and(eq(attempts.userId, candidateUserId), eq(attempts.attemptType, "practice")),
  });
  if (priorAttempt) {
    return { eligible: false, reason: "already_completed_a_practice_incident" };
  }

  return { eligible: true };
}

export type ClaimReferralResult =
  | { ok: true; referral: Referral; passId: string; alreadyClaimed: boolean }
  | {
      ok: false;
      reason:
        | "expired"
        | "revoked"
        | "self_referral"
        | "already_attached_to_referral"
        | "already_consumed_a_pass"
        | "already_completed_a_practice_incident"
        | "claimed_by_other";
    };

/**
 * Claims a referral: validates eligibility, binds the referred user
 * exactly once, and grants exactly one Incident Pass — storing its id as
 * referredIncidentPassId, which is the exact-lineage anchor referral
 * qualification (terminal-attempt.ts) checks against later. Never trusts
 * a client-supplied referrer id — the referrer is resolved purely from
 * the code itself (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §16).
 */
export async function claimReferral(
  referral: Referral,
  referredUser: User,
): Promise<ClaimReferralResult> {
  if (referral.referredUserId !== null) {
    if (referral.referredUserId === referredUser.id && referral.referredIncidentPassId) {
      return {
        ok: true,
        referral,
        passId: referral.referredIncidentPassId,
        alreadyClaimed: true,
      };
    }
    return { ok: false, reason: "claimed_by_other" };
  }

  if (referral.status === "revoked") return { ok: false, reason: "revoked" };
  if (referral.expiresAt && referral.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }

  const eligibility = await evaluateReferralEligibility(referral, referredUser.id);
  if (!eligibility.eligible) {
    return { ok: false, reason: eligibility.reason };
  }

  const result = await db.transaction(async (tx) => {
    const current = await tx.query.referrals.findFirst({
      where: eq(referrals.id, referral.id),
    });
    if (!current) throw new Error("Referral disappeared mid-transaction");
    if (current.referredUserId !== null) {
      return current;
    }

    const pass =
      (await grantIncidentPass(tx, {
        userId: referredUser.id,
        sourceType: "referral_reward",
        sourceId: referral.id,
      })) ??
      (await tx.query.incidentPasses.findFirst({
        where: and(
          eq(incidentPasses.sourceType, "referral_reward"),
          eq(incidentPasses.sourceId, referral.id),
        ),
      }));
    if (!pass) throw new Error("Failed to grant Incident Pass for referral claim");

    const [updated] = await tx
      .update(referrals)
      .set({
        status: "claimed",
        referredUserId: referredUser.id,
        referredIncidentPassId: pass.id,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(referrals.id, referral.id), isNull(referrals.referredUserId)))
      .returning();

    if (!updated) {
      const reRead = await tx.query.referrals.findFirst({
        where: eq(referrals.id, referral.id),
      });
      if (!reRead) throw new Error("Referral disappeared mid-transaction");
      return reRead;
    }

    return updated;
  });

  if (result.referredUserId !== referredUser.id) {
    return { ok: false, reason: "claimed_by_other" };
  }
  if (!result.referredIncidentPassId) {
    throw new Error("Claimed referral has no referredIncidentPassId");
  }

  return {
    ok: true,
    referral: result,
    passId: result.referredIncidentPassId,
    alreadyClaimed: false,
  };
}
