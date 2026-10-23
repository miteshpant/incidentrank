import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
import { loadOrgAssessment, loadOrgCandidate } from "./assessment-access";
import { generateInviteToken, hashInviteToken, INVITE_EXPIRY_MS } from "./invite-token";

/**
 * Integration tests against the local Postgres. Covers Phase 4's assessment
 * creation (scenario id + version recorded), the company result access
 * privacy boundary (organization-scoped), and unauthorized result access.
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-assess-access-owner";
const TEST_AUTH_OTHER_ORG_OWNER = "test-assess-access-other-owner";
const TEST_AUTH_CANDIDATE = "test-assess-access-candidate";
const TEST_ORG_SLUG = "test-assess-access-acme";
const TEST_OTHER_ORG_SLUG = "test-assess-access-globex";

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
  // Organizations cascade-delete their members and assessments (which
  // cascade to candidates); assessments.createdByUserId restricts user
  // deletion while an assessment still references them, so organizations
  // must be removed first.
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb
    .delete(organizations)
    .where(eq(organizations.slug, TEST_OTHER_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb
    .delete(users)
    .where(eq(users.authProviderId, TEST_AUTH_OTHER_ORG_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createOrgWithOwner(authId: string, slug: string, name: string) {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: authId, displayName: name })
    .returning();
  if (!owner) throw new Error("owner not created");

  const [org] = await testDb.insert(organizations).values({ name, slug }).returning();
  if (!org) throw new Error("org not created");

  await testDb
    .insert(organizationMembers)
    .values({ organizationId: org.id, userId: owner.id, role: "owner" });

  return { owner, org };
}

describe("assessment creation", () => {
  it("stores the scenario id and version at creation time", async () => {
    const { owner, org } = await createOrgWithOwner(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );

    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        name: "Staff Backend Engineer Assessment",
        scenarioId,
        scenarioVersion,
        createdByUserId: owner.id,
      })
      .returning();

    expect(assessment?.scenarioId).toBe(scenarioId);
    expect(assessment?.scenarioVersion).toBe(scenarioVersion);
    expect(assessment?.status).toBe("draft");
  });
});

describe("company result access and privacy boundary", () => {
  it("an organization member can view a candidate assessment belonging to their org", async () => {
    const { owner, org } = await createOrgWithOwner(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );

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
        normalizedEmail: "candidate@example.com",
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      })
      .returning();
    if (!candidate) throw new Error("candidate not created");

    const result = await loadOrgCandidate(org.slug, assessment.id, candidate.id, owner);
    expect(result.ok).toBe(true);
  });

  it("a different organization's member cannot access the assessment", async () => {
    const { owner, org } = await createOrgWithOwner(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );
    const { owner: otherOwner } = await createOrgWithOwner(
      TEST_AUTH_OTHER_ORG_OWNER,
      TEST_OTHER_ORG_SLUG,
      "Globex",
    );

    const [assessment] = await testDb
      .insert(assessments)
      .values({
        organizationId: org.id,
        name: "Assessment",
        scenarioId,
        scenarioVersion,
        createdByUserId: owner.id,
      })
      .returning();
    if (!assessment) throw new Error("assessment not created");

    // The other org's owner attempts to view Acme's assessment via Globex's
    // own slug — must not resolve.
    const result = await loadOrgAssessment(
      TEST_OTHER_ORG_SLUG,
      assessment.id,
      otherOwner,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  it("the company cannot access a candidate's practice attempt through assessment/company routes", async () => {
    const { owner, org } = await createOrgWithOwner(
      TEST_AUTH_OWNER,
      TEST_ORG_SLUG,
      "Acme Corp",
    );

    const [candidateUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "Candidate" })
      .returning();
    if (!candidateUser) throw new Error("candidate user not created");

    // The candidate's own private practice attempt — never linked to any
    // assessment.
    const [practiceAttempt] = await testDb
      .insert(attempts)
      .values({
        userId: candidateUser.id,
        scenarioId,
        scenarioVersion,
        attemptType: "practice",
        status: "completed",
        outcome: "resolved",
        score: 912,
      })
      .returning();
    if (!practiceAttempt) throw new Error("practice attempt not created");

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
    const [candidateRow] = await testDb
      .insert(assessmentCandidates)
      .values({
        assessmentId: assessment.id,
        email: "candidate@example.com",
        normalizedEmail: "candidate@example.com",
        userId: candidateUser.id,
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
        status: "invited",
        // No attemptId set — the candidate has not started the assessment,
        // only has an unrelated practice attempt.
      })
      .returning();
    if (!candidateRow) throw new Error("candidate row not created");

    const result = await loadOrgCandidate(
      org.slug,
      assessment.id,
      candidateRow.id,
      owner,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // The only attempt reachable through this chain is whatever
      // candidate.attemptId points to — here, null. The practice attempt's
      // id must never appear anywhere in this result.
      expect(result.candidate.attemptId).toBeNull();
      expect(result.candidate.attemptId).not.toBe(practiceAttempt.id);
    }
  });
});
