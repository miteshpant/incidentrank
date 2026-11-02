import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { attempts, challenges, scenarios, users, type Attempt, type Challenge } from "@incidentrank/db";
import { db } from "./db";
import { generateChallengeToken, hashChallengeToken, CHALLENGE_TOKEN_EXPIRY_MS } from "./challenge-token";

type TxOrDb = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export type CreateChallengeResult =
  | { ok: true; token: string; challenge: Challenge }
  | { ok: false; reason: "attempt_not_found" | "attempt_not_eligible" };

/**
 * docs/implementation_plan/phase-challege-version.md §5/§6/§11 — the one
 * entry point for turning a just-finished practice attempt into a
 * shareable challenge link. Eligibility is enforced here, in application
 * code, never trusted from the client: the attempt must belong to the
 * calling user, be a `practice` attempt (never `assessment`), carry no
 * `assessmentId` (belt-and-suspenders — company evaluation attempts must
 * never become challenge links, §11/§16), and be terminal (`completed`).
 * Only the SHA-256 hash of the token is ever persisted
 * (challenge-token.ts); the plaintext is returned exactly once, here.
 */
export async function createChallenge(
  challengerUserId: string,
  attemptId: string,
): Promise<CreateChallengeResult> {
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
  });
  if (!attempt || attempt.userId !== challengerUserId) {
    return { ok: false, reason: "attempt_not_found" };
  }
  if (
    attempt.attemptType !== "practice" ||
    attempt.assessmentId !== null ||
    attempt.status !== "completed"
  ) {
    return { ok: false, reason: "attempt_not_eligible" };
  }

  const token = generateChallengeToken();
  const [created] = await db
    .insert(challenges)
    .values({
      tokenHash: hashChallengeToken(token),
      scenarioId: attempt.scenarioId,
      challengerUserId,
      challengerAttemptId: attempt.id,
      expiresAt: new Date(Date.now() + CHALLENGE_TOKEN_EXPIRY_MS),
    })
    .returning();
  if (!created) throw new Error("Failed to create challenge");

  return { ok: true, token, challenge: created };
}

export interface ChallengeLandingDTO {
  challengeId: string;
  scenarioSlug: string;
  scenarioName: string;
  /** Null when the challenger's display name shouldn't be shown — never
   * exposes email or any other private profile data either way. */
  challengerDisplayName: string | null;
}

/**
 * The no-spoiler landing lookup (§7/§8) — hashes the provided token and
 * resolves ONLY what's safe to show before the challenged engineer has
 * solved anything: scenario identity and the challenger's existing
 * account display name. Never returns score, completion tier, actions,
 * reasoning, or final state — those live on the attempt rows, which this
 * function never even selects. Returns null for an unknown or expired
 * token (both render as a 404 to the caller, deliberately
 * indistinguishable from each other).
 */
export async function getChallengeByToken(token: string): Promise<ChallengeLandingDTO | null> {
  const tokenHash = hashChallengeToken(token);
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.tokenHash, tokenHash),
  });
  if (!challenge) return null;
  if (challenge.expiresAt && challenge.expiresAt.getTime() < Date.now()) return null;

  const [scenario, challenger] = await Promise.all([
    db.query.scenarios.findFirst({ where: eq(scenarios.id, challenge.scenarioId) }),
    db.query.users.findFirst({ where: eq(users.id, challenge.challengerUserId) }),
  ]);
  if (!scenario) return null;

  return {
    challengeId: challenge.id,
    scenarioSlug: scenario.slug,
    scenarioName: scenario.name,
    challengerDisplayName: safeDisplayName(challenger?.displayName),
  };
}

/**
 * §7's "Mitesh challenged you" vs. "An engineer challenged you" split
 * explicitly forbids exposing an email address (§7/§16). users.displayName
 * falls back to the account's email when Clerk has no fullName/username
 * set (current-user.ts) — that fallback is fine for every other surface
 * that already shows it to the user themselves, but is never safe to
 * forward into a challenge invite seen by a different person. A plain
 * shape check (not a full RFC validator — this only needs to catch the
 * common "looks like an email" case) is enough here; a false negative
 * just means a slightly unusual name string renders as-is, which is the
 * safe direction to fail in.
 */
function safeDisplayName(displayName: string | null | undefined): string | null {
  if (!displayName) return null;
  if (displayName.includes("@")) return null;
  return displayName;
}

export type AcceptChallengeResult =
  | { ok: true; scenarioSlug: string }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Records which signed-in user accepted the invite (§7's "Accept
 * Challenge" action) and returns the scenario slug to send them into —
 * the normal /incidents/[slug] practice flow, never a parallel simulator
 * (§4). Idempotent: accepting an already-accepted link just re-confirms
 * the same challengedUserId rather than erroring, since a candidate may
 * legitimately revisit their own accept link.
 */
export async function acceptChallenge(
  token: string,
  challengedUserId: string,
): Promise<AcceptChallengeResult> {
  const tokenHash = hashChallengeToken(token);
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.tokenHash, tokenHash),
  });
  if (!challenge) return { ok: false, reason: "not_found" };
  if (challenge.expiresAt && challenge.expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (!challenge.challengedUserId) {
    await db
      .update(challenges)
      .set({ challengedUserId })
      .where(eq(challenges.id, challenge.id));
  }

  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, challenge.scenarioId),
  });
  if (!scenario) return { ok: false, reason: "not_found" };

  return { ok: true, scenarioSlug: scenario.slug };
}

/**
 * Called from persistTerminalAttempt (terminal-attempt.ts), the single
 * server-authoritative convergence point every practice attempt's
 * completion passes through — mirrors how referral qualification and
 * Engineer Rank recalculation already hook in at that exact spot. Finds
 * the most recent still-pending challenge where this exact user was
 * invited to this exact scenario (challengedUserId set via acceptChallenge,
 * challengedAttemptId still null) and links this attempt, enabling the
 * comparison. A true no-op for every attempt that isn't a challenge
 * accept — the common case — since the lookup simply finds nothing.
 * Practice attempts only; the caller never invokes this for an
 * assessment attempt (§11).
 */
export async function linkChallengedAttemptIfPending(
  tx: TxOrDb,
  userId: string,
  scenarioId: string,
  attemptId: string,
): Promise<boolean> {
  const pending = await tx.query.challenges.findFirst({
    where: and(
      eq(challenges.challengedUserId, userId),
      eq(challenges.scenarioId, scenarioId),
      isNull(challenges.challengedAttemptId),
    ),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  if (!pending) return false;

  await tx
    .update(challenges)
    .set({ challengedAttemptId: attemptId })
    .where(eq(challenges.id, pending.id));
  return true;
}

export interface ChallengeComparisonSide {
  displayName: string | null;
  score: number | null;
  outcome: string | null;
  completionTier: string | null;
  recoveryTimeMs: number | null;
  breakdown: {
    recovery: number | null;
    customerImpact: number | null;
    dataIntegrity: number | null;
    reliability: number | null;
    costEfficiency: number | null;
    operationalEfficiency: number | null;
  };
}

export type ChallengeComparisonResult =
  | { ok: true; scenarioSlug: string; scenarioName: string; challenger: ChallengeComparisonSide; challenged: ChallengeComparisonSide }
  | { ok: false; reason: "not_found" | "forbidden" | "not_ready" };

/**
 * §9's side-by-side comparison, with the §8/§16 spoiler guard enforced
 * server-side: only a participant (challenger or challenged) may ever
 * call this successfully, and only once BOTH attempts have reached a
 * terminal status. Never trusts a client-supplied "show me anyway" flag
 * — "not_ready" is returned (not partial data) until the challenged
 * attempt is terminal. Only fields already shown on the normal practice
 * result screen are ever included (score, outcome, tier, recovery time,
 * per-dimension breakdown) — never reasoning text, action sequence, or
 * any authoring/scoring-rule detail (§9's explicit exclusion list).
 */
export async function getChallengeComparison(
  challengeId: string,
  requestingUserId: string,
): Promise<ChallengeComparisonResult> {
  const challenge = await db.query.challenges.findFirst({
    where: eq(challenges.id, challengeId),
  });
  if (!challenge) return { ok: false, reason: "not_found" };
  if (
    requestingUserId !== challenge.challengerUserId &&
    requestingUserId !== challenge.challengedUserId
  ) {
    return { ok: false, reason: "forbidden" };
  }
  if (!challenge.challengedAttemptId) {
    return { ok: false, reason: "not_ready" };
  }

  const [scenario, challengerUser, challengedUser, challengerAttempt, challengedAttempt] =
    await Promise.all([
      db.query.scenarios.findFirst({ where: eq(scenarios.id, challenge.scenarioId) }),
      db.query.users.findFirst({ where: eq(users.id, challenge.challengerUserId) }),
      challenge.challengedUserId
        ? db.query.users.findFirst({ where: eq(users.id, challenge.challengedUserId) })
        : null,
      db.query.attempts.findFirst({ where: eq(attempts.id, challenge.challengerAttemptId) }),
      db.query.attempts.findFirst({ where: eq(attempts.id, challenge.challengedAttemptId) }),
    ]);

  if (!scenario || !challengerAttempt || !challengedAttempt) {
    return { ok: false, reason: "not_found" };
  }
  if (challengerAttempt.status !== "completed" || challengedAttempt.status !== "completed") {
    return { ok: false, reason: "not_ready" };
  }

  function toSide(attempt: Attempt, displayName: string | null): ChallengeComparisonSide {
    return {
      displayName,
      score: attempt.score,
      outcome: attempt.outcome,
      completionTier: attempt.completionTier,
      recoveryTimeMs: attempt.recoveryTimeMs,
      breakdown: {
        recovery: attempt.recoveryScore,
        customerImpact: attempt.customerImpactScore,
        dataIntegrity: attempt.dataIntegrityScore,
        reliability: attempt.reliabilityScore,
        costEfficiency: attempt.costEfficiencyScore,
        operationalEfficiency: attempt.operationalEfficiencyScore,
      },
    };
  }

  return {
    ok: true,
    scenarioSlug: scenario.slug,
    scenarioName: scenario.name,
    challenger: toSide(challengerAttempt, safeDisplayName(challengerUser?.displayName)),
    challenged: toSide(challengedAttempt, safeDisplayName(challengedUser?.displayName)),
  };
}
