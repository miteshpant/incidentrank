import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, challenges, scenarios, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import {
  acceptChallenge,
  createChallenge,
  getChallengeByToken,
  getChallengeComparison,
  linkChallengedAttemptIfPending,
} from "./challenge";
import { hashChallengeToken } from "./challenge-token";

/**
 * docs/implementation_plan/phase-challege-version.md §18 — real
 * Postgres, real seeded payment-retry-storm scenario (never a throwaway
 * row, matching attempts.test.ts's established fixture style).
 */
let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_PREFIX = "test-challenge-";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = paymentRetryStorm.version;
});

afterEach(async () => {
  const testUsers = await testDb.query.users.findMany({});
  const relevantUsers = testUsers.filter((u) => u.authProviderId.startsWith(TEST_AUTH_PREFIX));
  for (const user of relevantUsers) {
    await testDb.delete(challenges).where(eq(challenges.challengerUserId, user.id));
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    await testDb.delete(users).where(eq(users.id, user.id));
  }
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let counter = 0;
function uniqueAuthId(): string {
  counter += 1;
  return `${TEST_AUTH_PREFIX}${counter}`;
}

async function createUser(displayName: string) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: uniqueAuthId(), displayName })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createAttempt(
  userId: string,
  overrides: Partial<typeof attempts.$inferInsert> = {},
) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId,
      scenarioId,
      scenarioVersion,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      score: 900,
      ...overrides,
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

describe("createChallenge", () => {
  it("creates a challenge and returns a token whose hash matches the persisted row", async () => {
    const user = await createUser("Challenger");
    const attempt = await createAttempt(user.id);

    const result = await createChallenge(user.id, attempt.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const row = await testDb.query.challenges.findFirst({ where: eq(challenges.id, result.challenge.id) });
    expect(row?.tokenHash).toBe(hashChallengeToken(result.token));
    expect(row?.challengerAttemptId).toBe(attempt.id);
  });

  it("rejects an attempt belonging to a different user", async () => {
    const owner = await createUser("Owner");
    const other = await createUser("Other");
    const attempt = await createAttempt(owner.id);

    const result = await createChallenge(other.id, attempt.id);
    expect(result).toEqual({ ok: false, reason: "attempt_not_found" });
  });

  it("rejects an in-progress (non-terminal) attempt", async () => {
    const user = await createUser("Still Playing");
    const attempt = await createAttempt(user.id, { status: "in_progress", outcome: null, score: null });

    const result = await createChallenge(user.id, attempt.id);
    expect(result).toEqual({ ok: false, reason: "attempt_not_eligible" });
  });

  it("rejects an assessment attempt even if it belongs to the user and is terminal — company evaluation attempts must never become challenge links", async () => {
    const user = await createUser("Candidate");
    const attempt = await createAttempt(user.id, { attemptType: "assessment" });

    const result = await createChallenge(user.id, attempt.id);
    expect(result).toEqual({ ok: false, reason: "attempt_not_eligible" });
  });
});

describe("getChallengeByToken — no-spoiler landing", () => {
  it("returns only scenario identity and the challenger's display name, never score/outcome/tier", async () => {
    const user = await createUser("Jane Challenger");
    const attempt = await createAttempt(user.id, { score: 950, completionTier: "optimal" });
    const result = await createChallenge(user.id, attempt.id);
    if (!result.ok) throw new Error("expected ok");

    const landing = await getChallengeByToken(result.token);
    expect(landing).toEqual({
      challengeId: result.challenge.id,
      scenarioSlug: "payment-retry-storm",
      scenarioName: expect.any(String),
      challengerDisplayName: "Jane Challenger",
    });
    expect(Object.keys(landing ?? {})).not.toContain("score");
    expect(Object.keys(landing ?? {})).not.toContain("outcome");
  });

  it("returns null for an unknown token", async () => {
    expect(await getChallengeByToken("not-a-real-token")).toBeNull();
  });

  it("never exposes a displayName that is actually an email address (falls back to null/neutral wording)", async () => {
    // users.displayName falls back to the account's email when Clerk has
    // no fullName/username set (current-user.ts) — confirmed live in
    // browser QA to leak a real email onto the challenge landing page
    // before this guard existed. §7/§16 explicitly forbid this.
    const user = await createUser("qa-test+clerk@example.com");
    const attempt = await createAttempt(user.id);
    const result = await createChallenge(user.id, attempt.id);
    if (!result.ok) throw new Error("expected ok");

    const landing = await getChallengeByToken(result.token);
    expect(landing?.challengerDisplayName).toBeNull();
  });
});

describe("acceptChallenge", () => {
  it("records the challenged user and returns the scenario slug", async () => {
    const challenger = await createUser("Challenger A");
    const challenged = await createUser("Challenged A");
    const attempt = await createAttempt(challenger.id);
    const created = await createChallenge(challenger.id, attempt.id);
    if (!created.ok) throw new Error("expected ok");

    const result = await acceptChallenge(created.token, challenged.id);
    expect(result).toEqual({ ok: true, scenarioSlug: "payment-retry-storm" });

    const row = await testDb.query.challenges.findFirst({ where: eq(challenges.id, created.challenge.id) });
    expect(row?.challengedUserId).toBe(challenged.id);
  });

  it("returns not_found for an invalid token", async () => {
    const user = await createUser("Nobody");
    expect(await acceptChallenge("invalid-token", user.id)).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("linkChallengedAttemptIfPending + getChallengeComparison — spoiler guard", () => {
  it("returns not_ready before the challenged attempt is linked", async () => {
    const challenger = await createUser("Challenger B");
    const challenged = await createUser("Challenged B");
    const challengerAttempt = await createAttempt(challenger.id, { score: 900 });
    const created = await createChallenge(challenger.id, challengerAttempt.id);
    if (!created.ok) throw new Error("expected ok");
    await acceptChallenge(created.token, challenged.id);

    const result = await getChallengeComparison(created.challenge.id, challenger.id);
    expect(result).toEqual({ ok: false, reason: "not_ready" });
  });

  it("becomes available with both sides' real scores once the challenged attempt completes and is linked", async () => {
    const challenger = await createUser("Challenger C");
    const challenged = await createUser("Challenged C");
    const challengerAttempt = await createAttempt(challenger.id, { score: 900 });
    const created = await createChallenge(challenger.id, challengerAttempt.id);
    if (!created.ok) throw new Error("expected ok");
    await acceptChallenge(created.token, challenged.id);

    const challengedAttempt = await createAttempt(challenged.id, { score: 820 });
    await testDb.transaction((tx) =>
      linkChallengedAttemptIfPending(tx, challenged.id, scenarioId, challengedAttempt.id),
    );

    const result = await getChallengeComparison(created.challenge.id, challenger.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.challenger.score).toBe(900);
    expect(result.challenged.score).toBe(820);
  });

  it("rejects a request from a user who is not a participant in the challenge", async () => {
    const challenger = await createUser("Challenger D");
    const challenged = await createUser("Challenged D");
    const outsider = await createUser("Outsider D");
    const challengerAttempt = await createAttempt(challenger.id);
    const created = await createChallenge(challenger.id, challengerAttempt.id);
    if (!created.ok) throw new Error("expected ok");
    await acceptChallenge(created.token, challenged.id);
    const challengedAttempt = await createAttempt(challenged.id);
    await testDb.transaction((tx) =>
      linkChallengedAttemptIfPending(tx, challenged.id, scenarioId, challengedAttempt.id),
    );

    const result = await getChallengeComparison(created.challenge.id, outsider.id);
    expect(result).toEqual({ ok: false, reason: "forbidden" });
  });

  it("linkChallengedAttemptIfPending is a no-op (returns false) when no challenge is pending for this user/scenario", async () => {
    const user = await createUser("No Challenge");
    const attempt = await createAttempt(user.id);

    await expect(
      testDb.transaction((tx) => linkChallengedAttemptIfPending(tx, user.id, scenarioId, attempt.id)),
    ).resolves.toBe(false);
  });

  it("linkChallengedAttemptIfPending returns true when it actually links a pending challenge", async () => {
    const challenger = await createUser("Challenger E");
    const challenged = await createUser("Challenged E");
    const challengerAttempt = await createAttempt(challenger.id);
    const created = await createChallenge(challenger.id, challengerAttempt.id);
    if (!created.ok) throw new Error("expected ok");
    await acceptChallenge(created.token, challenged.id);
    const challengedAttempt = await createAttempt(challenged.id);

    await expect(
      testDb.transaction((tx) =>
        linkChallengedAttemptIfPending(tx, challenged.id, scenarioId, challengedAttempt.id),
      ),
    ).resolves.toBe(true);
  });
});
