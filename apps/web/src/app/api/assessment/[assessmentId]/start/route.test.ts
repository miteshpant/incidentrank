import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  attempts,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "@/lib/server/invite-token";
import type { POST as PostHandler } from "./route";

/**
 * Route-level test for docs/implementation_plan/phase10a.md §17/§18/§67:
 * a brand-new assessment attempt must not start against a suspended
 * organization's assessment, but an already-started attempt must always
 * remain resumable regardless of organization status — this is the one
 * candidate-privacy/continuity guarantee Phase 10A adds to the
 * candidate-side start route.
 */

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Start Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-start-route-owner";
const TEST_AUTH_CANDIDATE = "test-start-route-candidate";
const TEST_ORG_SLUG = "test-start-route-acme";

let POST: typeof PostHandler;

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = paymentRetryStorm.version;
  ({ POST } = await import("./route"));
}, 30_000);

afterEach(async () => {
  mockAuth.userId = null;
  const org = await testDb.query.organizations.findFirst({ where: eq(organizations.slug, TEST_ORG_SLUG) });
  if (org) {
    const orgAssessments = await testDb.query.assessments.findMany({ where: eq(assessments.organizationId, org.id) });
    for (const assessment of orgAssessments) {
      await testDb.delete(attempts).where(eq(attempts.assessmentId, assessment.id));
    }
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createAssessmentWithCandidate(orgStatus: "active" | "suspended") {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  if (!owner) throw new Error("owner not created");

  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Acme Corp", slug: TEST_ORG_SLUG, status: orgStatus })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb.insert(organizationMembers).values({ organizationId: org.id, userId: owner.id, role: "owner" });

  const [assessment] = await testDb
    .insert(assessments)
    .values({
      organizationId: org.id,
      name: "Assessment",
      scenarioId,
      scenarioVersion,
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
  const [candidate] = await testDb
    .insert(assessmentCandidates)
    .values({
      assessmentId: assessment.id,
      email: "candidate@example.com",
      normalizedEmail: "candidate@example.com",
      userId: candidateUser.id,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      status: "invited",
    })
    .returning();
  if (!candidate) throw new Error("candidate not created");

  return { org, assessment, candidateUser, candidate };
}

function buildRequest(assessmentId: string) {
  return new Request(`http://internal/api/assessment/${assessmentId}/start`, {
    method: "POST",
  });
}

describe("POST /api/assessment/[assessmentId]/start — suspension guard (phase10a.md §17/§18)", () => {
  it("rejects starting a brand-new attempt against a suspended organization's assessment", async () => {
    const { assessment, candidateUser } = await createAssessmentWithCandidate("suspended");
    mockAuth.userId = TEST_AUTH_CANDIDATE;
    void candidateUser;

    const response = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(response.status).toBe(403);
  });

  it("allows starting a brand-new attempt against an active organization's assessment", async () => {
    const { assessment } = await createAssessmentWithCandidate("active");
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const response = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attempt.status).toBe("in_progress");
  });

  it("resuming an already-started attempt succeeds even while the organization is suspended", async () => {
    const { assessment, candidate, candidateUser } = await createAssessmentWithCandidate("active");
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const firstStart = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(firstStart.status).toBe(200);
    const firstBody = await firstStart.json();
    const attemptId = firstBody.attempt.id as string;

    // Suspend the organization AFTER the attempt has already started.
    await testDb
      .update(organizations)
      .set({ status: "suspended" })
      .where(eq(organizations.id, (await testDb.query.assessments.findFirst({
        where: eq(assessments.id, assessment.id),
      }))!.organizationId));

    const resumeResponse = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(resumeResponse.status).toBe(200);
    const resumeBody = await resumeResponse.json();
    expect(resumeBody.attempt.id).toBe(attemptId);

    void candidate;
    void candidateUser;
  });
});
