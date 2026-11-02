import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  analyticsEvents,
  attempts,
  scenarios,
  users,
  weeklyChallenges,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";
import { activateWeeklyChallenge, deactivateWeeklyChallenge } from "@/lib/server/weekly-challenge";

const TEST_AUTH_ID = "test-weekly-challenge-access";
const PAID_SCENARIO_SLUG = "rate-limit-misconfiguration";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Weekly Challenge Access Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

/**
 * docs/implementation_plan/phase-challege-version.md §3/§18 — the
 * highest-value target: proves the currently active Weekly Challenge
 * actually bypasses the paid-practice gate on the real attempt-creation
 * route, and that the bypass disappears the moment the challenge is
 * deactivated. Mirrors attempts/route.test.ts's "paid-scenario practice
 * gate" describe block's exact fixture shape, kept in its own file so
 * this suite's weeklyChallenges activate/deactivate calls can never
 * interleave with that file's own env-var stubbing across describe
 * blocks.
 */
describe("POST /api/attempts — Weekly Challenge bypasses the paid gate", () => {
  let testDb: Db;
  let POST: typeof PostHandler;
  let scenarioId: string;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
    const scenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, PAID_SCENARIO_SLUG),
    });
    if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
    scenarioId = scenario.id;
  }, 30_000);

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_UNLOCK_PAID_SCENARIOS", undefined);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await testDb.delete(weeklyChallenges).where(eq(weeklyChallenges.scenarioId, scenarioId));
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_ID) });
    if (user) {
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
      await testDb.delete(analyticsEvents).where(eq(analyticsEvents.userId, user.id));
    }
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
  });

  afterAll(async () => {
    await testDb.$client.end({ timeout: 1 });
  });

  function buildRequest(host: string, scenarioSlug: string) {
    return new Request("http://internal/api/attempts", {
      method: "POST",
      headers: { host, "content-type": "application/json" },
      body: JSON.stringify({ scenarioSlug }),
    });
  }

  it("still refuses the paid scenario before any Weekly Challenge is active", async () => {
    const response = await POST(buildRequest("localhost:3000", PAID_SCENARIO_SLUG));
    expect(response.status).toBe(403);
  });

  it("creates an attempt for the paid scenario once it is the active Weekly Challenge, tagging weeklyChallengeId", async () => {
    const [admin] = await testDb
      .insert(users)
      .values({ authProviderId: "test-weekly-challenge-access-admin", displayName: "Admin" })
      .returning();
    if (!admin) throw new Error("admin user not created");

    const challenge = await testDb.transaction((tx) =>
      activateWeeklyChallenge(tx, { scenarioId, adminUserId: admin.id }),
    );

    const response = await POST(buildRequest("localhost:3000", PAID_SCENARIO_SLUG));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attempt.weeklyChallengeId).toBe(challenge.id);

    await testDb.delete(users).where(eq(users.authProviderId, "test-weekly-challenge-access-admin"));
  });

  it("reverts to locked once the Weekly Challenge is deactivated", async () => {
    const [admin] = await testDb
      .insert(users)
      .values({ authProviderId: "test-weekly-challenge-access-admin-2", displayName: "Admin" })
      .returning();
    if (!admin) throw new Error("admin user not created");

    await testDb.transaction((tx) => activateWeeklyChallenge(tx, { scenarioId, adminUserId: admin.id }));
    await testDb.transaction((tx) => deactivateWeeklyChallenge(tx));

    const response = await POST(buildRequest("localhost:3000", PAID_SCENARIO_SLUG));
    expect(response.status).toBe(403);

    await testDb.delete(users).where(eq(users.authProviderId, "test-weekly-challenge-access-admin-2"));
  });
});
