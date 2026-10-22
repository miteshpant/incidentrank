import "server-only";
import { randomBytes, createHash } from "node:crypto";

/**
 * Invite tokens are generated as cryptographically random opaque strings,
 * never derived from or encoding any candidate/assessment data. Only the
 * SHA-256 hash is stored (assessment_candidates.inviteTokenHash); the
 * plaintext is returned to the inviter exactly once, at creation time, and
 * is never persisted or retrievable again. See the Phase 4 completion
 * report for the documented security tradeoff this implies for this POC.
 *
 * Phase 4.1 adds simple expiration (no rotation): each invitation expires
 * INVITE_EXPIRY_MS after creation. Already-claimed candidates
 * (assessmentCandidates.userId set) never depend on the token again, so
 * expiry only blocks un-accepted invitations.
 */
export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
