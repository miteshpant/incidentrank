import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
import {
  claimReferral,
  createReferralCode,
  evaluateReferralEligibility,
  isEligibleToReferOthers,
  loadReferralByCode,
} from "./referrals";

let testDb: Db;

const TEST_AUTH_REFERRER = "test-referrals-referrer";
const TEST_AUTH_REFERRED = "test-referrals-referred";
const TEST_AUTH_OTHER = "test-referrals-other";
const TEST_SCENARIO_SLUG = "test-referrals-scenario";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  for (const authId of [TEST_AUTH_REFERRER, TEST_AUTH_REFERRED, TEST_AUTH_OTHER]) {
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, authId) });
    if (user) {
      await testDb.delete(referrals).where(eq(referrals.referrerUserId, user.id));
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
      await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
    }
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_REFERRER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_REFERRED));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER));
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
    .values({ slug: TEST_SCENARIO_SLUG, name: "Test Referrals Scenario", ownershipType: "incidentrank" })
    .returning();
  if (!scenario) throw new Error("scenario not created");
  return scenario;
}

async function makeEligibleReferrer() {
  const referrer = await createUser(TEST_AUTH_REFERRER, "Referrer");
  const scenario = await createScenario();
  const [pass] = await testDb
    .insert(incidentPasses)
    .values({ userId: referrer.id, sourceType: "admin_grant", status: "consumed" })
    .returning();
  if (!pass) throw new Error("pass not created");
  await testDb.insert(attempts).values({
    userId: referrer.id,
    scenarioId: scenario.id,
    scenarioVersion: 1,
    attemptType: "practice",
    status: "completed",
    outcome: "resolved",
    completionTier: "optimal",
    incidentPassId: pass.id,
  });
  return referrer;
}

describe("isEligibleToReferOthers", () => {
  it("is false for a user with no resolved pass-funded attempt", async () => {
    const user = await createUser(TEST_AUTH_REFERRER, "Referrer");
    expect(await isEligibleToReferOthers(user.id)).toBe(false);
  });

  it("is true once the user has a resolved acceptable/optimal pass-funded attempt", async () => {
    const referrer = await makeEligibleReferrer();
    expect(await isEligibleToReferOthers(referrer.id)).toBe(true);
  });
});

describe("createReferralCode / loadReferralByCode", () => {
  it("returns null for an ineligible user", async () => {
    const user = await createUser(TEST_AUTH_REFERRER, "Referrer");
    const result = await createReferralCode(user.id);
    expect(result).toBeNull();
  });

  it("creates a code for an eligible user that resolves back via loadReferralByCode", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    expect(result).not.toBeNull();

    const loaded = await loadReferralByCode(result!.code);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.referral.id).toBe(result!.referral.id);
  });
});

describe("evaluateReferralEligibility", () => {
  it("rejects self-referral", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");

    const eligibility = await evaluateReferralEligibility(result.referral, referrer.id);
    expect(eligibility.eligible).toBe(false);
    if (!eligibility.eligible) expect(eligibility.reason).toBe("self_referral");
  });

  it("accepts a genuinely new user", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");

    const eligibility = await evaluateReferralEligibility(result.referral, referred.id);
    expect(eligibility.eligible).toBe(true);
  });

  it("rejects a user who already completed a practice incident", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const scenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, TEST_SCENARIO_SLUG),
    });
    if (!scenario) throw new Error("scenario missing");
    await testDb.insert(attempts).values({
      userId: referred.id,
      scenarioId: scenario.id,
      scenarioVersion: 1,
      attemptType: "practice",
      status: "in_progress",
    });

    const eligibility = await evaluateReferralEligibility(result.referral, referred.id);
    expect(eligibility.eligible).toBe(false);
    if (!eligibility.eligible) {
      expect(eligibility.reason).toBe("already_completed_a_practice_incident");
    }
  });
});

describe("claimReferral", () => {
  it("grants exactly one pass and stores referredIncidentPassId", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");

    const claimed = await claimReferral(result.referral, referred);
    expect(claimed.ok).toBe(true);
    if (claimed.ok) {
      expect(claimed.alreadyClaimed).toBe(false);
      const pass = await testDb.query.incidentPasses.findFirst({
        where: eq(incidentPasses.id, claimed.passId),
      });
      expect(pass?.userId).toBe(referred.id);
      expect(pass?.sourceType).toBe("referral_reward");

      const referralRow = await testDb.query.referrals.findFirst({
        where: eq(referrals.id, result.referral.id),
      });
      expect(referralRow?.referredIncidentPassId).toBe(claimed.passId);
      expect(referralRow?.status).toBe("claimed");
    }
  });

  it("is idempotent for repeated claims by the same user", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");

    const first = await claimReferral(result.referral, referred);
    const reloaded = await testDb.query.referrals.findFirst({
      where: eq(referrals.id, result.referral.id),
    });
    if (!reloaded) throw new Error("referral not found");
    const second = await claimReferral(reloaded, referred);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.passId).toBe(first.passId);
      expect(second.alreadyClaimed).toBe(true);
    }
  });

  it("rejects a second different user once already claimed", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");
    const other = await createUser(TEST_AUTH_OTHER, "Other");

    await claimReferral(result.referral, referred);
    const reloaded = await testDb.query.referrals.findFirst({
      where: eq(referrals.id, result.referral.id),
    });
    if (!reloaded) throw new Error("referral not found");

    const result2 = await claimReferral(reloaded, other);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.reason).toBe("claimed_by_other");
  });

  it("two concurrent claim attempts by the same user grant exactly one pass", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    const referred = await createUser(TEST_AUTH_REFERRED, "Referred");

    const [a, b] = await Promise.all([
      claimReferral(result.referral, referred),
      claimReferral(result.referral, referred),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);

    const passes = await testDb.query.incidentPasses.findMany({
      where: eq(incidentPasses.sourceId, result.referral.id),
    });
    expect(passes.length).toBe(1);
  });
});
