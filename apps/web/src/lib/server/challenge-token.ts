import "server-only";
import { randomBytes, createHash } from "node:crypto";

/**
 * Challenge share-link tokens follow invite-token.ts's exact precedent:
 * a cryptographically random opaque string, never derived from or
 * encoding any user/scenario data. Only the SHA-256 hash is ever
 * persisted (challenges.tokenHash); the plaintext is returned to the
 * challenger exactly once, at creation time, and is never retrievable
 * again.
 */
export const CHALLENGE_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

export function generateChallengeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashChallengeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
