import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, users, attempts, incidentPasses, scenarios, referrals, type Db } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

const TEST_AUTH_ID = "test-referral-code-route";
const TEST_SCENARIO_SLUG = "test-referral-code-route-scenario";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Referral Code Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("POST /api/referrals/code", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_ID) });
    if (user) {
      await testDb.delete(referrals).where(eq(referrals.referrerUserId, user.id));
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
      await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
    }
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
    await testDb.delete(scenarios).where(eq(scenarios.slug, TEST_SCENARIO_SLUG));
  });

  it("rejects an ineligible user", async () => {
    await testDb.insert(users).values({ authProviderId: TEST_AUTH_ID, displayName: "Tester" });
    const response = await POST();
    expect(response.status).toBe(403);
  });

  it("returns a code for an eligible user", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Tester" })
      .returning();
    if (!user) throw new Error("user not created");
    const [scenario] = await testDb
      .insert(scenarios)
      .values({ slug: TEST_SCENARIO_SLUG, name: "Test Scenario", ownershipType: "incidentrank" })
      .returning();
    if (!scenario) throw new Error("scenario not created");
    const [pass] = await testDb
      .insert(incidentPasses)
      .values({ userId: user.id, sourceType: "admin_grant", status: "consumed" })
      .returning();
    if (!pass) throw new Error("pass not created");
    await testDb.insert(attempts).values({
      userId: user.id,
      scenarioId: scenario.id,
      scenarioVersion: 1,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      completionTier: "optimal",
      incidentPassId: pass.id,
    });

    const response = await POST();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.code).toBe("string");
  });
});
