import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, scenarios, users, attempts, type Db } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import type { GET as GetHandler } from "./route";

const TEST_AUTH_ID = "test-attempt-privacy-route";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Privacy Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

/**
 * Route-level negative privacy regression for the confirmed
 * GET /api/attempts/[attemptId] leak surface (docs/implementation_plan/
 * phase7.action.md section 6, item 1). redact-attempt-for-candidate.test.ts
 * already proves the pure helper strips every evaluation-derived field;
 * this proves the actual route handler is wired to call it — the gap
 * class a pure-function-only test can never catch (the handler could
 * still return the raw row even with a perfectly-correct helper sitting
 * unused beside it).
 */
describe("GET /api/attempts/[attemptId] — assessment candidate result privacy", () => {
  let testDb: Db;
  let GET: typeof GetHandler;
  let userId: string;
  let scenarioId: string;
  let assessmentAttemptId: string;
  let practiceAttemptId: string;

  beforeAll(async () => {
    testDb = createDb();
    ({ GET } = await import("./route"));

    const scenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });
    if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
    scenarioId = scenario.id;

    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Privacy Route Tester" })
      .returning();
    if (!user) throw new Error("fixture user not created");
    userId = user.id;

    const scoredFields = {
      userId,
      scenarioId,
      scenarioVersion: paymentRetryStorm.version,
      status: "completed" as const,
      outcome: "resolved" as const,
      completionTier: "optimal" as const,
      score: 975,
      recoveryScore: 300,
      customerImpactScore: 200,
      dataIntegrityScore: 200,
      reliabilityScore: 150,
      costEfficiencyScore: 75,
      operationalEfficiencyScore: 50,
    };

    const [assessmentAttempt] = await testDb
      .insert(attempts)
      .values({ ...scoredFields, attemptType: "assessment" })
      .returning();
    const [practiceAttempt] = await testDb
      .insert(attempts)
      .values({ ...scoredFields, attemptType: "practice" })
      .returning();
    if (!assessmentAttempt || !practiceAttempt) throw new Error("fixtures not created");
    assessmentAttemptId = assessmentAttempt.id;
    practiceAttemptId = practiceAttempt.id;
  }, 30_000);

  afterAll(async () => {
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
    await testDb.$client.end({ timeout: 1 });
  });

  function buildRequest(attemptId: string) {
    return new Request(`http://internal/api/attempts/${attemptId}`);
  }

  it("never returns score/tier/outcome for an assessment attempt, even though the candidate owns it", async () => {
    const response = await GET(buildRequest(assessmentAttemptId), {
      params: Promise.resolve({ attemptId: assessmentAttemptId }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { attempt: Record<string, unknown> };
    expect(body.attempt.attemptType).toBe("assessment");
    expect(body.attempt.submitted).toBe(true);
    expect(body.attempt).not.toHaveProperty("score");
    expect(body.attempt).not.toHaveProperty("outcome");
    expect(body.attempt).not.toHaveProperty("completionTier");
    expect(body.attempt).not.toHaveProperty("recoveryScore");
    expect(body.attempt).not.toHaveProperty("customerImpactScore");
    expect(body.attempt).not.toHaveProperty("dataIntegrityScore");
    expect(body.attempt).not.toHaveProperty("reliabilityScore");
    expect(body.attempt).not.toHaveProperty("costEfficiencyScore");
    expect(body.attempt).not.toHaveProperty("operationalEfficiencyScore");
    // Round-trips through the real HTTP JSON response, not just an
    // in-memory object — a key that was merely set to `undefined` would
    // already have been dropped before this point, but this confirms
    // the actual bytes sent to the browser never carried it either.
    expect(JSON.stringify(body.attempt)).not.toMatch(/score/i);
  });

  it("still returns the full score/tier/outcome for a practice attempt", async () => {
    const response = await GET(buildRequest(practiceAttemptId), {
      params: Promise.resolve({ attemptId: practiceAttemptId }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { attempt: Record<string, unknown> };
    expect(body.attempt.attemptType).toBe("practice");
    expect(body.attempt.score).toBe(975);
    expect(body.attempt.outcome).toBe("resolved");
    expect(body.attempt.completionTier).toBe("optimal");
  });
});
