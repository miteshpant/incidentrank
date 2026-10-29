import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  legalAcceptances,
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
 * Route-level cases from docs/implementation_plan/phasse10d.md §70
 * not already covered by ../../start/route.test.ts's notice-requirement
 * describe block: candidate can view/accept the notice, wrong user
 * cannot accept on another candidate's behalf, and the acceptance is
 * correctly bound to this (organization, assessment) pair.
 */

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Notice Accept Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-notice-accept-owner";
const TEST_AUTH_CANDIDATE = "test-notice-accept-candidate";
const TEST_AUTH_OTHER = "test-notice-accept-other-user";
const TEST_ORG_SLUG = "test-notice-accept-acme";

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
      await testDb.delete(assessmentCandidates).where(eq(assessmentCandidates.assessmentId, assessment.id));
    }
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createAssessmentWithCandidate() {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  if (!owner) throw new Error("owner not created");

  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Acme Corp", slug: TEST_ORG_SLUG, status: "active" })
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
  await testDb.insert(assessmentCandidates).values({
    assessmentId: assessment.id,
    email: "candidate@example.com",
    normalizedEmail: "candidate@example.com",
    userId: candidateUser.id,
    inviteTokenHash: hashInviteToken(token),
    inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    status: "invited",
  });

  return { org, assessment, candidateUser };
}

function buildRequest(assessmentId: string) {
  return new Request(`http://internal/api/assessment/${assessmentId}/notice/accept`, { method: "POST" });
}

describe("POST /api/assessment/[assessmentId]/notice/accept", () => {
  it("1. the invited candidate can accept the notice", async () => {
    const { org, assessment, candidateUser } = await createAssessmentWithCandidate();
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const response = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(response.status).toBe(200);

    const rows = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, candidateUser.id),
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.acceptanceType).toBe("candidate_assessment_notice");
    expect(rows[0]?.organizationId).toBe(org.id);
    expect(rows[0]?.assessmentId).toBe(assessment.id);
  });

  it("2. a user not invited to this assessment cannot accept on anyone's behalf", async () => {
    const { assessment } = await createAssessmentWithCandidate();
    await testDb.insert(users).values({ authProviderId: TEST_AUTH_OTHER, displayName: "Other" });
    mockAuth.userId = TEST_AUTH_OTHER;

    const response = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(response.status).toBe(403);
  });

  it("3. an unauthenticated request is rejected", async () => {
    const { assessment } = await createAssessmentWithCandidate();

    const response = await POST(buildRequest(assessment.id), {
      params: Promise.resolve({ assessmentId: assessment.id }),
    });
    expect(response.status).toBe(401);
  });

  it("4. repeated acceptance is safe, recording distinct history rows", async () => {
    const { assessment, candidateUser } = await createAssessmentWithCandidate();
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    await POST(buildRequest(assessment.id), { params: Promise.resolve({ assessmentId: assessment.id }) });
    await POST(buildRequest(assessment.id), { params: Promise.resolve({ assessmentId: assessment.id }) });

    const rows = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, candidateUser.id),
    });
    expect(rows.length).toBe(2);
  });
});
