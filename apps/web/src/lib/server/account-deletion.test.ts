import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import {
  attempts,
  legalAcceptances,
  organizationMembers,
  organizations,
  privacyRequests,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { deleteOwnAccount } from "./account-deletion";
import { recordLegalAcceptance } from "./legal-acceptance";

/**
 * Phase 10D §42/§43/§63: self-service account deletion anonymizes
 * identity fields while retaining organizational/billing/audit/
 * legal-acceptance rows, per the confirmed product decision.
 */

let testDb: Db;
let scenarioId: string;
const TEST_AUTH_PREFIX = "test-account-deletion-";
const TEST_ORG_SLUG = "test-account-deletion-org";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
});

afterEach(async () => {
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_PREFIX}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    await testDb.delete(organizationMembers).where(eq(organizationMembers.userId, user.id));
    await testDb.delete(legalAcceptances).where(eq(legalAcceptances.userId, user.id));
    await testDb.delete(privacyRequests).where(eq(privacyRequests.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_PREFIX}%`));
  // Also catch the anonymized authProviderId this function itself writes.
  await testDb.delete(users).where(like(users.authProviderId, "anonymized_deleted-%"));
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let userCounter = 0;
async function createUser() {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      authProviderId: `${TEST_AUTH_PREFIX}${userCounter}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Deletion Tester",
      leaderboardVisible: true,
    })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

describe("deleteOwnAccount", () => {
  it("1. scrambles displayName and authProviderId, flips leaderboardVisible to false", async () => {
    const user = await createUser();
    const originalAuthProviderId = user.authProviderId;

    await deleteOwnAccount(user.id);

    const reloaded = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(reloaded?.displayName).not.toBe("Deletion Tester");
    expect(reloaded?.authProviderId).not.toBe(originalAuthProviderId);
    expect(reloaded?.leaderboardVisible).toBe(false);
  });

  it("2. retains organization membership, re-pointed at the same (now-anonymized) user id", async () => {
    const user = await createUser();
    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Deletion Test Org", slug: TEST_ORG_SLUG, status: "active" })
      .returning();
    if (!org) throw new Error("org not created");
    await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: user.id, role: "member" });

    await deleteOwnAccount(user.id);

    const membership = await testDb.query.organizationMembers.findFirst({
      where: eq(organizationMembers.userId, user.id),
    });
    expect(membership).toBeDefined();
    expect(membership?.organizationId).toBe(org.id);
  });

  it("3. retains attempts (practice/assessment history)", async () => {
    const user = await createUser();
    await testDb.insert(attempts).values({
      userId: user.id,
      scenarioId,
      scenarioVersion: 1,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      score: 800,
    });

    await deleteOwnAccount(user.id);

    const userAttempts = await testDb.query.attempts.findMany({ where: eq(attempts.userId, user.id) });
    expect(userAttempts.length).toBe(1);
  });

  it("4. never deletes legal_acceptances — consent evidence is permanent", async () => {
    const user = await createUser();
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    await recordLegalAcceptance(user.id, "privacy_policy", {}, testDb);

    await deleteOwnAccount(user.id);

    const acceptances = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, user.id),
    });
    expect(acceptances.length).toBe(2);
  });

  it("5. writes a completed deletion privacy_requests row synchronously", async () => {
    const user = await createUser();

    await deleteOwnAccount(user.id);

    const requests = await testDb.query.privacyRequests.findMany({
      where: eq(privacyRequests.userId, user.id),
    });
    expect(requests.length).toBe(1);
    expect(requests[0]?.requestType).toBe("deletion");
    expect(requests[0]?.status).toBe("completed");
    expect(requests[0]?.completedAt).toBeInstanceOf(Date);
  });
});
