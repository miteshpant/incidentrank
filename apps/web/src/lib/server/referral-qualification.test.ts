import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  attempts,
  incidentPasses,
  referrals,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { qualifyReferralForAttempt } from "./referral-qualification";
import { grantIncidentPass } from "./incident-passes";
import { generateInviteToken } from "./invite-token";

let testDb: Db;

const TEST_AUTH_REFERRER = "test-referral-qual-referrer";
const TEST_AUTH_REFERRED = "test-referral-qual-referred";
const TEST_SCENARIO_SLUG = "test-referral-qual-scenario";

beforeAll(async () => {
  testDb = createDb();
});

beforeEach(() => {
  vi.stubEnv("REFERRALS_ENABLED", "true");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const authId of [TEST_AUTH_REFERRER, TEST_AUTH_REFERRED]) {
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
    if (user) {
      await testDb.delete(referrals).where(eq(referrals.referrerUserId, user.id));
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
      await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
    }
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_REFERRER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_REFERRED));
  await testDb.delete(scenarios).where(eq(scenarios.slug, TEST_SCENARIO_SLUG));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(authProviderId: string, displayName: string) {
  const [user] = await testDb.insert(users).values({ authProviderId, displayName }).returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createScenario() {
  const [scenario] = await testDb
    .insert(scenarios)
    .values({ slug: TEST_SCENARIO_SLUG, name: "Test Referral Qual Scenario", ownershipType: "incidentrank" })
    .returning();
  if (!scenario) throw new Error("scenario not created");
  return scenario;
}

/**
 * referrals.qualifyingAttemptId is a real FK to attempts.id — a
 * genuine attempt row (not just a random uuid) is required for any test
 * that exercises the actual reward path.
 */
async function createAttempt(userId: string, incidentPassId: string | null, scenarioId: string) {
  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId,
      scenarioId,
      scenarioVersion: 1,
      attemptType: "practice",
      status: "in_progress",
      incidentPassId,
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  return attempt;
}

async function createClaimedReferral(referrerId: string, referredId: string, referredPassId: string) {
  const code = generateInviteToken();
  const [referral] = await testDb
    .insert(referrals)
    .values({
      referralCode: code,
      referrerUserId: referrerId,
      referredUserId: referredId,
      referredIncidentPassId: referredPassId,
      status: "claimed",
      claimedAt: new Date(),
    })
    .returning();
  if (!referral) throw new Error("referral not created");
  return referral;
}

/**
 * Mirrors claimReferral's actual grantIncidentPass call exactly
 * (sourceType="referral_reward", sourceId=referral.id) rather than the
 * simpler admin_grant fixture used elsewhere in this file — this exact
 * sourceId is what later collided with qualifyReferralForAttempt's own
 * reward-pass grant under the same (sourceType, sourceId) unique index
 * (both used sourceId=referral.id), a real bug caught live in Phase 8
 * QA-12 that the admin_grant-fixture tests could never reproduce.
 */
async function grantClaimPass(referredUserId: string, referralId: string) {
  const { grantIncidentPass } = await import("./incident-passes");
  const pass = await grantIncidentPass(testDb, {
    userId: referredUserId,
    sourceType: "referral_reward",
    sourceId: referralId,
  });
  if (!pass) throw new Error("claim pass not granted");
  return pass;
}

describe("qualifyReferralForAttempt — lineage correctness", () => {
  it("rewards the referrer when the qualifying attempt was funded by the exact referred pass", async () => {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const scenario = await createScenario();
    const referredPass = await grantIncidentPass(testDb, {
      userId: referred.id,
      sourceType: "admin_grant",
    });
    if (!referredPass) throw new Error("pass not granted");
    const referral = await createClaimedReferral(referrer.id, referred.id, referredPass.id);
    const attempt = await createAttempt(referred.id, referredPass.id, scenario.id);

    await qualifyReferralForAttempt(testDb, {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: referredPass.id,
      outcome: "resolved",
      completionTier: "optimal",
    });

    const reloaded = await testDb.query.referrals.findFirst({ where: eq(referrals.id, referral.id) });
    expect(reloaded?.status).toBe("rewarded");
    expect(reloaded?.rewardIncidentPassId).toBeTruthy();

    const rewardPass = await testDb.query.incidentPasses.findFirst({
      where: eq(incidentPasses.id, reloaded!.rewardIncidentPassId!),
    });
    expect(rewardPass?.userId).toBe(referrer.id);
    expect(rewardPass?.sourceType).toBe("referral_reward");
  });

  /**
   * Regression: live Phase 8 QA-12 caught this failing in production
   * shape — claimReferral grants the referred user's claim pass with
   * sourceType="referral_reward", sourceId=referral.id; the reward grant
   * used to reuse that exact same (sourceType, sourceId) pair for the
   * referrer's reward pass, colliding against incident_passes_source_idx.
   * onConflictDoNothing silently lost that race, and the
   * findPassBySource fallback "successfully" resolved to the referred
   * user's own claim pass — the referral was marked rewarded with
   * rewardIncidentPassId pointing at a pass the REFERRER never received
   * and the REFERRED user already owned. This test uses the exact real
   * sourceId claimReferral uses (not the admin_grant fixture the other
   * tests in this file use) to reproduce and pin the fix.
   */
  it("grants the referrer a genuinely NEW pass, never the referred user's own claim pass, even though both share sourceType='referral_reward'", async () => {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const scenario = await createScenario();

    const code = generateInviteToken();
    const [referral] = await testDb
      .insert(referrals)
      .values({ referralCode: code, referrerUserId: referrer.id })
      .returning();
    if (!referral) throw new Error("referral not created");

    const claimPass = await grantClaimPass(referred.id, referral.id);

    const [claimed] = await testDb
      .update(referrals)
      .set({
        status: "claimed",
        referredUserId: referred.id,
        referredIncidentPassId: claimPass.id,
        claimedAt: new Date(),
      })
      .where(eq(referrals.id, referral.id))
      .returning();
    if (!claimed) throw new Error("referral not claimed");

    const attempt = await createAttempt(referred.id, claimPass.id, scenario.id);

    await qualifyReferralForAttempt(testDb, {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: claimPass.id,
      outcome: "resolved",
      completionTier: "acceptable",
    });

    const reloaded = await testDb.query.referrals.findFirst({ where: eq(referrals.id, referral.id) });
    expect(reloaded?.status).toBe("rewarded");
    expect(reloaded?.rewardIncidentPassId).toBeTruthy();
    // The critical assertion: the reward pass must NOT be the same row
    // as the referred user's claim pass.
    expect(reloaded?.rewardIncidentPassId).not.toBe(claimPass.id);

    const rewardPass = await testDb.query.incidentPasses.findFirst({
      where: eq(incidentPasses.id, reloaded!.rewardIncidentPassId!),
    });
    expect(rewardPass?.userId).toBe(referrer.id);
    expect(rewardPass?.sourceType).toBe("referral_reward");

    const referrerPasses = await testDb.query.incidentPasses.findMany({
      where: eq(incidentPasses.userId, referrer.id),
    });
    expect(referrerPasses).toHaveLength(1);
    expect(referrerPasses[0]?.id).toBe(rewardPass?.id);
  });

  it("does NOT reward when the resolved attempt was funded by a DIFFERENT pass than the referral's own", async () => {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const referredPass = await grantIncidentPass(testDb, {
      userId: referred.id,
      sourceType: "admin_grant",
    });
    if (!referredPass) throw new Error("pass not granted");
    await createClaimedReferral(referrer.id, referred.id, referredPass.id);

    // A second, unrelated pass funds the attempt instead.
    const unrelatedPass = await grantIncidentPass(testDb, {
      userId: referred.id,
      sourceType: "admin_grant",
    });
    if (!unrelatedPass) throw new Error("unrelated pass not granted");

    await qualifyReferralForAttempt(testDb, {
      attemptId: crypto.randomUUID(),
      userId: referred.id,
      incidentPassId: unrelatedPass.id,
      outcome: "resolved",
      completionTier: "optimal",
    });

    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referrerUserId, referrer.id),
    });
    expect(referralRow?.status).toBe("claimed");
    expect(referralRow?.rewardIncidentPassId).toBeNull();
  });

  it("does NOT reward an attempt with no incidentPassId at all (free scenario)", async () => {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const referredPass = await grantIncidentPass(testDb, {
      userId: referred.id,
      sourceType: "admin_grant",
    });
    if (!referredPass) throw new Error("pass not granted");
    await createClaimedReferral(referrer.id, referred.id, referredPass.id);

    await qualifyReferralForAttempt(testDb, {
      attemptId: crypto.randomUUID(),
      userId: referred.id,
      incidentPassId: null,
      outcome: "resolved",
      completionTier: "optimal",
    });

    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referrerUserId, referrer.id),
    });
    expect(referralRow?.status).toBe("claimed");
  });
});

describe("qualifyReferralForAttempt — outcome gating", () => {
  async function setupClaimedReferral() {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, { userId: referred.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    const referral = await createClaimedReferral(referrer.id, referred.id, pass.id);
    const attempt = await createAttempt(referred.id, pass.id, scenario.id);
    return { referrer, referred, pass, referral, attempt };
  }

  it("a failed attempt does not qualify", async () => {
    const { referred, pass, attempt } = await setupClaimedReferral();
    await qualifyReferralForAttempt(testDb, {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "failed",
      completionTier: null,
    });
    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referredIncidentPassId, pass.id),
    });
    expect(referralRow?.status).toBe("claimed");
  });

  it("a declared_unstable attempt does not qualify", async () => {
    const { referred, pass, attempt } = await setupClaimedReferral();
    await qualifyReferralForAttempt(testDb, {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "declared_unstable",
      completionTier: null,
    });
    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referredIncidentPassId, pass.id),
    });
    expect(referralRow?.status).toBe("claimed");
  });

  it("an acceptable resolved attempt qualifies", async () => {
    const { referred, pass, attempt } = await setupClaimedReferral();
    await qualifyReferralForAttempt(testDb, {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "resolved",
      completionTier: "acceptable",
    });
    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referredIncidentPassId, pass.id),
    });
    expect(referralRow?.status).toBe("rewarded");
  });

  it("an optimal resolved attempt qualifies", async () => {
    const { referred, pass, attempt } = await setupClaimedReferral();
    await qualifyReferralForAttempt(testDb, {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "resolved",
      completionTier: "optimal",
    });
    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referredIncidentPassId, pass.id),
    });
    expect(referralRow?.status).toBe("rewarded");
  });
});

describe("qualifyReferralForAttempt — idempotency and concurrency", () => {
  it("duplicate/replayed qualification calls for the same attempt do not double-reward", async () => {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, { userId: referred.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await createClaimedReferral(referrer.id, referred.id, pass.id);
    const attempt = await createAttempt(referred.id, pass.id, scenario.id);
    const input = {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "resolved" as const,
      completionTier: "optimal" as const,
    };

    await qualifyReferralForAttempt(testDb, input);
    await qualifyReferralForAttempt(testDb, input);

    const rewardPasses = await testDb.query.incidentPasses.findMany({
      where: eq(incidentPasses.userId, referrer.id),
    });
    expect(rewardPasses.length).toBe(1);
  });

  it("concurrent qualification calls for the same attempt produce exactly one reward pass", async () => {
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, { userId: referred.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await createClaimedReferral(referrer.id, referred.id, pass.id);
    const attempt = await createAttempt(referred.id, pass.id, scenario.id);
    const input = {
      attemptId: attempt.id,
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "resolved" as const,
      completionTier: "optimal" as const,
    };

    await Promise.all([
      qualifyReferralForAttempt(testDb, input),
      qualifyReferralForAttempt(testDb, input),
    ]);

    const rewardPasses = await testDb.query.incidentPasses.findMany({
      where: eq(incidentPasses.userId, referrer.id),
    });
    expect(rewardPasses.length).toBe(1);
  });

  it("does nothing when REFERRALS_ENABLED is false", async () => {
    vi.stubEnv("REFERRALS_ENABLED", "false");
    const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const pass = await grantIncidentPass(testDb, { userId: referred.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await createClaimedReferral(referrer.id, referred.id, pass.id);

    await qualifyReferralForAttempt(testDb, {
      attemptId: crypto.randomUUID(),
      userId: referred.id,
      incidentPassId: pass.id,
      outcome: "resolved",
      completionTier: "optimal",
    });

    const referralRow = await testDb.query.referrals.findFirst({
      where: eq(referrals.referredIncidentPassId, pass.id),
    });
    expect(referralRow?.status).toBe("claimed");
  });
});
