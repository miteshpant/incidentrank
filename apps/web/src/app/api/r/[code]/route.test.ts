import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  users,
  attempts,
  incidentPasses,
  scenarios,
  referrals,
  type Db,
} from "@incidentrank/db";
import { createReferralCode } from "@/lib/server/referrals";
import type { GET as GetHandler, POST as PostHandler } from "./route";

const TEST_AUTH_REFERRER = "test-r-code-route-referrer";
const TEST_AUTH_REFERRED = "test-r-code-route-referred";
const TEST_SCENARIO_SLUG = "test-r-code-route-scenario";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "R Code Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("GET/POST /api/r/[code]", () => {
  let testDb: Db;
  let GET: typeof GetHandler;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ GET, POST } = await import("./route"));
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("REFERRALS_ENABLED", "true");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockAuth.userId = null;
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

  async function makeEligibleReferrer() {
    const [referrer] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_REFERRER, displayName: "Referrer" })
      .returning();
    if (!referrer) throw new Error("referrer not created");
    const [scenario] = await testDb
      .insert(scenarios)
      .values({ slug: TEST_SCENARIO_SLUG, name: "Test Scenario", ownershipType: "incidentrank" })
      .returning();
    if (!scenario) throw new Error("scenario not created");
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

  it("GET previews a valid code without requiring sign-in", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");

    const response = await GET(new Request("http://internal/api/r/x"), {
      params: Promise.resolve({ code: result.code }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.alreadyClaimed).toBe(false);
  });

  it("GET returns 404 for an unknown code", async () => {
    const response = await GET(new Request("http://internal/api/r/x"), {
      params: Promise.resolve({ code: "does-not-exist" }),
    });
    expect(response.status).toBe(404);
  });

  it("POST requires sign-in", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");

    const response = await POST(new Request("http://internal/api/r/x", { method: "POST" }), {
      params: Promise.resolve({ code: result.code }),
    });
    expect(response.status).toBe(401);
  });

  it("POST claims the referral and grants a pass to the referred user", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");
    await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_REFERRED, displayName: "Referred" });

    mockAuth.userId = TEST_AUTH_REFERRED;
    const response = await POST(new Request("http://internal/api/r/x", { method: "POST" }), {
      params: Promise.resolve({ code: result.code }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(typeof body.passId).toBe("string");
  });

  it("POST rejects self-referral", async () => {
    const referrer = await makeEligibleReferrer();
    const result = await createReferralCode(referrer.id);
    if (!result) throw new Error("code not created");

    mockAuth.userId = TEST_AUTH_REFERRER;
    const response = await POST(new Request("http://internal/api/r/x", { method: "POST" }), {
      params: Promise.resolve({ code: result.code }),
    });
    expect(response.status).toBe(403);
  });
});
