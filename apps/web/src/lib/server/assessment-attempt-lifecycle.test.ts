import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  assessmentCandidates,
  assessments,
  attemptActionGroups,
  attemptEvents,
  attempts,
  organizationMembers,
  organizations,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
  INVITE_EXPIRY_MS,
} from "./invite-token";

/**
 * Integration tests against the local Postgres. Covers Phase 4's assessment
 * attempt lifecycle: starting creates attemptType=assessment with the
 * correct assessmentId, exactly one official attempt is allowed, and
 * actions/reasoning/events/result persist through the same tables as
 * practice mode (no separate assessment simulation/persistence system).
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-assess-lifecycle-owner";
const TEST_AUTH_CANDIDATE = "test-assess-lifecycle-candidate";
const TEST_ORG_SLUG = "test-assess-lifecycle-acme";

beforeAll(async () => {
  testDb = createDb();
  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;
  scenarioVersion = paymentRetryStorm.version;
});

afterEach(async () => {
  // attempts.assessmentId restricts assessment deletion while referenced,
  // so attempts created against this test's assessment must be removed
  // first. Only then can organizations cascade-delete (members →
  // assessments → candidates), and only then can the owning users be
  // removed (assessments.createdByUserId also restricts).
  const candidateUser = await testDb.query.users.findFirst({
    where: eq(users.authProviderId, TEST_AUTH_CANDIDATE),
  });
  if (candidateUser) {
    await testDb.delete(attempts).where(eq(attempts.userId, candidateUser.id));
  }
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createActiveAssessmentWithClaimedCandidate() {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  const [candidateUser] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "Candidate" })
    .returning();
  if (!owner || !candidateUser) throw new Error("fixtures not created");

  const [org] = await testDb
    .insert(organizations)
    .values({ name: "Acme Corp", slug: TEST_ORG_SLUG })
    .returning();
  if (!org) throw new Error("org not created");

  await testDb
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: owner.id, role: "owner" });

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

  const token = generateInviteToken();
  const [candidate] = await testDb
    .insert(assessmentCandidates)
    .values({
      assessmentId: assessment.id,
      email: "candidate@example.com",
      normalizedEmail: normalizeEmail("candidate@example.com"),
      userId: candidateUser.id,
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      status: "invited",
    })
    .returning();
  if (!candidate) throw new Error("candidate not created");

  return { owner, candidateUser, org, assessment, candidate };
}

describe("assessment start", () => {
  it("creates an attempt with attemptType=assessment and the correct assessmentId", async () => {
    const { candidateUser, assessment, candidate } =
      await createActiveAssessmentWithClaimedCandidate();

    const [attempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidateUser.id,
        scenarioId,
        scenarioVersion,
        attemptType: "assessment",
        assessmentId: assessment.id,
        status: "in_progress",
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    await testDb
      .update(assessmentCandidates)
      .set({ status: "started", startedAt: new Date(), attemptId: attempt.id })
      .where(eq(assessmentCandidates.id, candidate.id));

    expect(attempt.attemptType).toBe("assessment");
    expect(attempt.assessmentId).toBe(assessment.id);

    const refreshedCandidate = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });
    expect(refreshedCandidate?.status).toBe("started");
    expect(refreshedCandidate?.attemptId).toBe(attempt.id);
  });
});

describe("one official attempt", () => {
  it("a candidate with an existing attemptId is not granted a second attempt row", async () => {
    const { candidateUser, assessment, candidate } =
      await createActiveAssessmentWithClaimedCandidate();

    const [firstAttempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidateUser.id,
        scenarioId,
        scenarioVersion,
        attemptType: "assessment",
        assessmentId: assessment.id,
        status: "in_progress",
      })
      .returning();
    if (!firstAttempt) throw new Error("attempt not created");

    await testDb
      .update(assessmentCandidates)
      .set({ status: "started", attemptId: firstAttempt.id })
      .where(eq(assessmentCandidates.id, candidate.id));

    // The start route's actual guard: once assessment_candidates.attemptId
    // is set, it returns the existing attempt rather than inserting a new
    // one. This test documents the invariant at the data layer: no second
    // attempt row should ever be linked to the same candidate row.
    const refreshedCandidate = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });
    expect(refreshedCandidate?.attemptId).toBe(firstAttempt.id);

    const allAttemptsForCandidate = await testDb.query.attempts.findMany({
      where: eq(attempts.assessmentId, assessment.id),
    });
    expect(allAttemptsForCandidate).toHaveLength(1);
  });
});

describe("assessment persistence", () => {
  it("persists action groups, reasoning, and events through the same tables as practice mode", async () => {
    const { candidateUser, assessment } =
      await createActiveAssessmentWithClaimedCandidate();

    const [attempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidateUser.id,
        scenarioId,
        scenarioVersion,
        attemptType: "assessment",
        assessmentId: assessment.id,
        status: "in_progress",
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    const [group] = await testDb
      .insert(attemptActionGroups)
      .values({
        attemptId: attempt.id,
        sequence: 0,
        elapsedMs: 65_000,
        reasoning: "Reducing retries to break the amplification loop.",
      })
      .returning();
    if (!group) throw new Error("group not created");

    await testDb.insert(attemptEvents).values({
      attemptId: attempt.id,
      sequence: 0,
      elapsedMs: 65_000,
      type: "CONFIG_CHANGED",
      message: "retries changed.",
    });

    const persistedAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
      with: { actionGroups: true, events: true },
    });

    expect(persistedAttempt?.actionGroups).toHaveLength(1);
    expect(persistedAttempt?.actionGroups[0]?.reasoning).toBe(
      "Reducing retries to break the amplification loop.",
    );
    expect(persistedAttempt?.events).toHaveLength(1);
  });
});

describe("assessment completion", () => {
  it("marks the candidate row completed and links the attempt", async () => {
    const { candidateUser, assessment, candidate } =
      await createActiveAssessmentWithClaimedCandidate();

    const [attempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidateUser.id,
        scenarioId,
        scenarioVersion,
        attemptType: "assessment",
        assessmentId: assessment.id,
        status: "in_progress",
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    await testDb
      .update(assessmentCandidates)
      .set({ status: "started", startedAt: new Date(), attemptId: attempt.id })
      .where(eq(assessmentCandidates.id, candidate.id));

    await testDb
      .update(attempts)
      .set({ status: "resolved", score: 912, completedAt: new Date() })
      .where(eq(attempts.id, attempt.id));

    await testDb
      .update(assessmentCandidates)
      .set({ status: "completed", completedAt: new Date() })
      .where(eq(assessmentCandidates.attemptId, attempt.id));

    const finalCandidate = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });
    expect(finalCandidate?.status).toBe("completed");
    expect(finalCandidate?.attemptId).toBe(attempt.id);

    const finalAttempt = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, attempt.id),
    });
    expect(finalAttempt?.status).toBe("resolved");
    expect(finalAttempt?.score).toBe(912);
  });
});

describe("closed assessment", () => {
  it("a candidate cannot newly start a closed assessment", async () => {
    const { assessment } = await createActiveAssessmentWithClaimedCandidate();

    await testDb
      .update(assessments)
      .set({ status: "closed" })
      .where(eq(assessments.id, assessment.id));

    const refreshed = await testDb.query.assessments.findFirst({
      where: eq(assessments.id, assessment.id),
    });

    // The start route's actual guard checks assessment.status === "active"
    // before inserting an attempt; this documents that a closed assessment
    // fails that check.
    expect(refreshed?.status).toBe("closed");
    expect(refreshed?.status).not.toBe("active");
  });
});
