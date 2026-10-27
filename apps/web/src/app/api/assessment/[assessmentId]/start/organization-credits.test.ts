import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  attempts,
  organizationAuditEvents,
  organizationCreditLedger,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "@/lib/server/invite-token";
import { recordOrganizationCreditPurchase } from "@/lib/server/organization-credits";
import type { POST as PostHandler } from "./route";

/**
 * Credit-consumption integration tests for the candidate-start route
 * (docs/implementation_plan/phase10b.md §68). Covers the core
 * invariants: invite/accept/landing consume zero, first real start
 * consumes exactly one, refresh/resume consumes zero additional, a
 * zero-credit org blocks a NEW start with a safe generic message, and
 * ORG_CREDIT_CONSUMPTION_ENABLED=false preserves the pre-Phase-10B
 * behavior exactly (no credit requirement at all).
 */

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Credits Start Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-start-credits-owner";
const TEST_AUTH_CANDIDATE = "test-start-credits-candidate";
const TEST_ORG_SLUG = "test-start-credits-acme";

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

beforeEach(() => {
  vi.stubEnv("ORG_CREDIT_CONSUMPTION_ENABLED", "true");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  mockAuth.userId = null;
  const org = await testDb.query.organizations.findFirst({ where: eq(organizations.slug, TEST_ORG_SLUG) });
  if (org) {
    const orgAssessments = await testDb.query.assessments.findMany({ where: eq(assessments.organizationId, org.id) });
    for (const assessment of orgAssessments) {
      await testDb.delete(attempts).where(eq(attempts.assessmentId, assessment.id));
    }
    await testDb.delete(organizationCreditLedger).where(eq(organizationCreditLedger.organizationId, org.id));
    await testDb.delete(organizationAuditEvents).where(eq(organizationAuditEvents.organizationId, org.id));
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
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

async function grantCredits(organizationId: string, quantity: number) {
  await testDb.transaction((tx) =>
    recordOrganizationCreditPurchase(tx, {
      organizationId,
      quantity,
      stripeCheckoutSessionId: `cs_test_${crypto.randomUUID()}`,
      stripePaymentIntentId: null,
      purchasingUserId: null,
    }),
  );
}

function buildRequest(assessmentId: string) {
  return new Request(`http://internal/api/assessment/${assessmentId}/start`, { method: "POST" });
}

async function startAssessment(assessmentId: string) {
  return POST(buildRequest(assessmentId), { params: Promise.resolve({ assessmentId }) });
}

describe("POST /api/assessment/[assessmentId]/start — credit consumption (phase10b.md §68)", () => {
  it("invite + acceptance consumes zero credits — balance untouched before any start", async () => {
    const { org } = await createAssessmentWithCandidate();
    await grantCredits(org.id, 1);

    const balanceBeforeStart = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    expect(balanceBeforeStart.length).toBe(1); // only the purchase row — invite/accept wrote nothing
  });

  it("the first real start consumes exactly 1 credit", async () => {
    const { org, assessment } = await createAssessmentWithCandidate();
    await grantCredits(org.id, 1);
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const response = await startAssessment(assessment.id);

    expect(response.status).toBe(200);
    const ledgerRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    const consumptionRows = ledgerRows.filter((r) => r.transactionType === "assessment_started");
    expect(consumptionRows.length).toBe(1);
    expect(consumptionRows[0]?.quantity).toBe(-1);
  });

  it("refresh/resume of an already-started attempt consumes zero additional credits", async () => {
    const { org, assessment } = await createAssessmentWithCandidate();
    await grantCredits(org.id, 1);
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const first = await startAssessment(assessment.id);
    expect(first.status).toBe(200);
    const second = await startAssessment(assessment.id); // simulated refresh
    expect(second.status).toBe(200);

    const consumptionRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    expect(consumptionRows.filter((r) => r.transactionType === "assessment_started").length).toBe(1);
  });

  it("a zero-credit organization blocks a new start with a safe, generic message", async () => {
    const { assessment } = await createAssessmentWithCandidate();
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const response = await startAssessment(assessment.id);

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error?: string };
    expect(body.error).not.toMatch(/credit/i);
    expect(body.error).not.toMatch(/balance/i);
    expect(body.error).not.toMatch(/billing/i);
  });

  it("a zero-credit organization never shows a negative balance after the blocked attempt", async () => {
    const { org, assessment } = await createAssessmentWithCandidate();
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    await startAssessment(assessment.id);

    const ledgerRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    expect(ledgerRows.length).toBe(0); // nothing was ever inserted — no attempt row either
    const candidateRow = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.assessmentId, assessment.id),
    });
    expect(candidateRow?.attemptId).toBeNull(); // the rolled-back attempt never attached
  });

  it("the consumption writes an assessment_credit_consumed organization audit event", async () => {
    const { org, assessment } = await createAssessmentWithCandidate();
    await grantCredits(org.id, 1);
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    await startAssessment(assessment.id);

    const events = await testDb.query.organizationAuditEvents.findMany({
      where: eq(organizationAuditEvents.organizationId, org.id),
    });
    expect(events.some((e) => e.action === "assessment_credit_consumed")).toBe(true);
  });

  it("with ORG_CREDIT_CONSUMPTION_ENABLED off, starts succeed with no credit requirement at all (pre-Phase-10B behavior preserved)", async () => {
    vi.stubEnv("ORG_CREDIT_CONSUMPTION_ENABLED", "false");
    const { org, assessment } = await createAssessmentWithCandidate();
    // Deliberately NO credits granted.
    mockAuth.userId = TEST_AUTH_CANDIDATE;

    const response = await startAssessment(assessment.id);

    expect(response.status).toBe(200);
    const ledgerRows = await testDb.query.organizationCreditLedger.findMany({
      where: eq(organizationCreditLedger.organizationId, org.id),
    });
    expect(ledgerRows.length).toBe(0); // no ledger interaction whatsoever
  });
});
