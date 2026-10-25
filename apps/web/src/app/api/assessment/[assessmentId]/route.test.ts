import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { rateLimitMisconfiguration } from "@incidentrank/scenarios";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "@/lib/server/invite-token";

const TEST_AUTH_OWNER = "test-assessment-meta-owner";
const TEST_AUTH_CANDIDATE = "test-assessment-meta-candidate";
const TEST_ORG_SLUG = "test-assessment-meta-org";

let authProviderId = TEST_AUTH_CANDIDATE;

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: authProviderId }),
  currentUser: async () => ({ fullName: "Meta Tester", username: null, primaryEmailAddress: null }),
}));

/**
 * Regression coverage added during Phase 6C closeout. The candidate-
 * facing assessment GET route (loadCandidateSafeScenarioMeta) was found
 * to hardcode `paymentRetryStorm`'s name/difficulty/duration for EVERY
 * built-in scenario, rather than resolving the scenario actually
 * assigned to the assessment. The bug was display-only — the real
 * runtime, controls, and scoring (served by the sibling scenario/route.ts,
 * which already resolves generically by slug) were never affected — but
 * it meant every built-in-scenario assessment showed "Payment Retry
 * Storm" on the candidate's briefing card and in-incident header
 * regardless of which scenario they were actually assigned, undetected
 * until now because every prior assessment test happened to use Payment
 * Retry Storm as its fixture. Fixed to resolve via
 * BUILT_IN_SCENARIO_CATALOG by the assessment's actual scenario slug.
 */
describe("GET /api/assessment/[assessmentId] — scenario metadata resolution", () => {
  let testDb: Db;

  beforeAll(() => {
    testDb = createDb();
  });

  afterEach(async () => {
    await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
  });

  afterAll(async () => {
    await testDb.$client.end({ timeout: 1 });
  });

  it("returns the actually-assigned built-in scenario's own name/difficulty/duration, not a hardcoded fallback", async () => {
    const scenarioRow = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, "rate-limit-misconfiguration"),
    });
    if (!scenarioRow) throw new Error("seed scenario missing — run pnpm db:seed");

    const [owner] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
      .returning();
    if (!owner) throw new Error("owner not created");

    const [org] = await testDb
      .insert(organizations)
      .values({ name: "Meta Test Org", slug: TEST_ORG_SLUG })
      .returning();
    if (!org) throw new Error("org not created");

    await testDb
      .insert(organizationMembers)
      .values({ organizationId: org.id, userId: owner.id, role: "owner" });

    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        name: "Meta Resolution Test",
        scenarioId: scenarioRow.id,
        scenarioVersion: rateLimitMisconfiguration.version,
        createdByUserId: owner.id,
        status: "active",
      })
      .returning();
    if (!assessment) throw new Error("assessment not created");

    const [candidateUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "Candidate" })
      .returning();
    if (!candidateUser) throw new Error("candidate user not created");

    const token = generateInviteToken();
    await testDb.insert(assessmentCandidates).values({
      assessmentId: assessment.id,
      email: "candidate@example.com",
      normalizedEmail: "candidate@example.com",
      userId: candidateUser.id,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    });

    authProviderId = TEST_AUTH_CANDIDATE;
    const { GET } = await import("./route");

    const response = await GET(new Request("http://internal"), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scenarioName).toBe(rateLimitMisconfiguration.name);
    expect(body.scenarioName).not.toBe("Payment Retry Storm");
    expect(body.scenarioDifficulty).toBe(rateLimitMisconfiguration.difficulty);
    expect(body.scenarioEstimatedMinutes).toBe(rateLimitMisconfiguration.estimatedMinutes);
  });
});
