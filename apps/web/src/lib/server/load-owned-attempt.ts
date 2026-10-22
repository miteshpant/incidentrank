import "server-only";
import { eq } from "drizzle-orm";
import { attempts, type Attempt, type Scenario, type User } from "@incidentrank/db";
import { db } from "./db";

export type OwnedAttempt = Attempt & { scenario: Scenario };

export type LoadOwnedAttemptResult =
  | { ok: true; attempt: OwnedAttempt }
  | { ok: false; status: 404 | 403 };

/**
 * Loads an attempt (with its scenario identity row) and verifies the
 * given user owns it. Never trusts the browser-supplied attemptId alone —
 * authorization happens here, server side, on every access. The scenario
 * relation is included so callers (e.g. the completion route, which must
 * branch scoring by ownershipType) never need a second query.
 */
export async function loadOwnedAttempt(
  attemptId: string,
  user: User,
): Promise<LoadOwnedAttemptResult> {
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { scenario: true },
  });

  if (!attempt) return { ok: false, status: 404 };
  if (attempt.userId !== user.id) return { ok: false, status: 403 };

  return { ok: true, attempt };
}
