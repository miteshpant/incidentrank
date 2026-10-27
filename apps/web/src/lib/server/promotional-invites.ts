import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import {
  promotionalInvites,
  type PromotionalInvite,
  type User,
} from "@incidentrank/db";
import { db } from "./db";
import { generateInviteToken, hashInviteToken, normalizeEmail } from "./invite-token";
import { findPassBySource, grantIncidentPass } from "./incident-passes";

const PROMOTIONAL_INVITE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PreviewPromotionalInvitesResult {
  valid: string[];
  duplicate: string[];
  invalid: string[];
}

/**
 * Bulk-processes a pasted/typed email list without writing anything to
 * the DB — a true preview step per docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §7.2 / phase8loc.md Step
 * 6 ("Do not create DB rows before the admin confirms the final
 * recipient set"). Normalizes whitespace, lowercases for canonical
 * comparison, deduplicates, validates format, and checks each
 * normalized email against any already-active (not redeemed/expired/
 * revoked) invite for the same campaign so a second accidental paste
 * doesn't silently create a duplicate active invite.
 */
export async function previewPromotionalInvites(
  rawEmails: string[],
  campaign: string | null,
): Promise<PreviewPromotionalInvitesResult> {
  const seen = new Set<string>();
  const valid: string[] = [];
  const duplicate: string[] = [];
  const invalid: string[] = [];

  for (const raw of rawEmails) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const normalized = normalizeEmail(trimmed);

    if (!EMAIL_FORMAT_RE.test(normalized)) {
      invalid.push(trimmed);
      continue;
    }
    if (seen.has(normalized)) {
      duplicate.push(trimmed);
      continue;
    }
    seen.add(normalized);

    const existingActive = await db.query.promotionalInvites.findFirst({
      where: and(
        eq(promotionalInvites.normalizedEmail, normalized),
        campaign ? eq(promotionalInvites.campaign, campaign) : undefined,
      ),
    });
    if (
      existingActive &&
      existingActive.status !== "expired" &&
      existingActive.status !== "revoked"
    ) {
      duplicate.push(trimmed);
      continue;
    }

    valid.push(trimmed);
  }

  return { valid, duplicate, invalid };
}

export interface CreatePromotionalInviteResult {
  invite: PromotionalInvite;
  token: string;
}

/**
 * Creates one promotional invite row + returns its raw token (shown to
 * the admin / passed to the email service exactly once, never
 * persisted — mirrors every other invite-token flow in this codebase).
 * Expects the caller to have already run previewPromotionalInvites and
 * confirmed the recipient set — this function does not re-validate
 * format/duplication, it just creates the row.
 */
export async function createPromotionalInvite(input: {
  email: string;
  campaign: string | null;
  expiresAt?: Date;
  createdByUserId: string;
}): Promise<CreatePromotionalInviteResult> {
  const token = generateInviteToken();
  const [invite] = await db
    .insert(promotionalInvites)
    .values({
      email: input.email,
      normalizedEmail: normalizeEmail(input.email),
      tokenHash: hashInviteToken(token),
      campaign: input.campaign,
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt ?? new Date(Date.now() + PROMOTIONAL_INVITE_EXPIRY_MS),
    })
    .returning();
  if (!invite) throw new Error("Failed to create promotional invite");

  return { invite, token };
}

export type LoadPromotionalInviteResult =
  | { ok: true; invite: PromotionalInvite }
  | { ok: false; reason: "not_found" };

export async function loadPromotionalInviteByToken(
  token: string,
): Promise<LoadPromotionalInviteResult> {
  const tokenHash = hashInviteToken(token);
  const invite = await db.query.promotionalInvites.findFirst({
    where: eq(promotionalInvites.tokenHash, tokenHash),
  });
  if (!invite) return { ok: false, reason: "not_found" };
  return { ok: true, invite };
}

export type RedeemPromotionalInviteResult =
  | { ok: true; invite: PromotionalInvite; passId: string; alreadyRedeemed: boolean }
  | { ok: false; reason: "revoked" | "expired" | "email_mismatch" | "claimed_by_other" };

/**
 * Redeems a promotional invite: validates state, binds the redeeming
 * user, and grants exactly one Incident Pass — all atomically (docs/
 * implementation_plan/phase8_admin_promotional_access_referrals.md §9.2
 * "Redemption idempotency"). Mirrors the assessment-invite/organization-
 * invite accept-route transaction shape: same-user repeat redemption
 * returns the existing (pass, not an error); a different user hitting
 * an already-redeemed invite is rejected with no metadata leak.
 */
export async function redeemPromotionalInvite(
  invite: PromotionalInvite,
  user: User,
  verifiedEmail: string | null,
): Promise<RedeemPromotionalInviteResult> {
  if (invite.redeemedByUserId !== null) {
    if (invite.redeemedByUserId === user.id && invite.incidentPassId) {
      return {
        ok: true,
        invite,
        passId: invite.incidentPassId,
        alreadyRedeemed: true,
      };
    }
    return { ok: false, reason: "claimed_by_other" };
  }

  if (invite.status === "revoked") return { ok: false, reason: "revoked" };
  if (invite.status === "expired" || invite.expiresAt < new Date()) {
    return { ok: false, reason: "expired" };
  }
  if (!verifiedEmail || normalizeEmail(verifiedEmail) !== invite.normalizedEmail) {
    return { ok: false, reason: "email_mismatch" };
  }

  const result = await db.transaction(async (tx) => {
    const current = await tx.query.promotionalInvites.findFirst({
      where: eq(promotionalInvites.id, invite.id),
    });
    if (!current) throw new Error("Invite disappeared mid-transaction");
    if (current.redeemedByUserId !== null) {
      // Lost a race to a concurrent redemption request that already
      // committed.
      return current;
    }

    // grantIncidentPass returns null when a concurrent transaction has
    // already granted (or is concurrently granting) a pass for this
    // exact source — the unique (sourceType, sourceId) index is what
    // makes that race detectable rather than silently double-granting.
    // Re-querying for that already-existing pass (rather than throwing)
    // keeps this function's own idempotency guarantee correct under
    // genuine concurrency, not just sequential repeated calls.
    const pass =
      (await grantIncidentPass(tx, {
        userId: user.id,
        sourceType: "promo_invite",
        sourceId: invite.id,
      })) ?? (await findPassBySource("promo_invite", invite.id));
    if (!pass) throw new Error("Failed to grant Incident Pass for promotional invite");

    const [updated] = await tx
      .update(promotionalInvites)
      .set({
        status: "redeemed",
        redeemedByUserId: user.id,
        redeemedAt: new Date(),
        incidentPassId: pass.id,
        updatedAt: new Date(),
      })
      .where(and(eq(promotionalInvites.id, invite.id), isNull(promotionalInvites.redeemedByUserId)))
      .returning();

    if (!updated) {
      // Another transaction committed its redemption between our read
      // above and this UPDATE — re-fetch the now-authoritative row
      // rather than reporting a spurious failure.
      const reRead = await tx.query.promotionalInvites.findFirst({
        where: eq(promotionalInvites.id, invite.id),
      });
      if (!reRead) throw new Error("Invite disappeared mid-transaction");
      return reRead;
    }

    return updated;
  });

  if (result.redeemedByUserId !== user.id) {
    return { ok: false, reason: "claimed_by_other" };
  }
  if (!result.incidentPassId) {
    throw new Error("Redeemed promotional invite has no incidentPassId");
  }

  return {
    ok: true,
    invite: result,
    passId: result.incidentPassId,
    alreadyRedeemed: false,
  };
}
