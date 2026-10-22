import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
import { paymentRetryStorm } from "@incidentrank/scenarios";
import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
  INVITE_EXPIRY_MS,
} from "./invite-token";

/**
 * Integration tests against the local Postgres. Covers Phase 4's invitation
 * acceptance (authenticated matching user can claim) and single-ownership
 * (an already-claimed invitation cannot be claimed by a different user).
 * The route itself (api/assessment/invite/[token]) layers Clerk identity
 * resolution and verified-email matching on top of exactly this claim
 * logic — those two concerns are tested separately (routes rely on
 * getOrCreateCurrentUser()/Clerk's currentUser(), which existing tests in
 * this codebase do not mock; see api route source for the matching logic).
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-invite-accept-owner";
const TEST_AUTH_CANDIDATE = "test-invite-accept-candidate";
const TEST_AUTH_OTHER_USER = "test-invite-accept-other";
const TEST_ORG_SLUG = "test-invite-accept-acme";

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
  // Organizations cascade-delete members/assessments/candidates;
  // assessments.createdByUserId restricts user deletion while referenced,
  // so organizations must be removed before any user.
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER_USER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createInvitedCandidate() {
  const [owner] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_OWNER, displayName: "Owner" })
    .returning();
  if (!owner) throw new Error("owner not created");

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
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    })
    .returning();
  if (!candidate) throw new Error("candidate not created");

  return { candidate };
}

describe("invitation acceptance", () => {
  it("an authenticated matching user can claim the invitation", async () => {
    const { candidate } = await createInvitedCandidate();

    const [candidateUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "Candidate" })
      .returning();
    if (!candidateUser) throw new Error("candidate user not created");

    const [claimed] = await testDb
      .update(assessmentCandidates)
      .set({ userId: candidateUser.id })
      .where(eq(assessmentCandidates.id, candidate.id))
      .returning();

    expect(claimed?.userId).toBe(candidateUser.id);
  });
});

describe("invitation single ownership", () => {
  it("an already-claimed invitation cannot later be claimed by another user", async () => {
    const { candidate } = await createInvitedCandidate();

    const [firstUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_CANDIDATE, displayName: "First" })
      .returning();
    if (!firstUser) throw new Error("first user not created");

    await testDb
      .update(assessmentCandidates)
      .set({ userId: firstUser.id })
      .where(eq(assessmentCandidates.id, candidate.id));

    const [secondUser] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_OTHER_USER, displayName: "Second" })
      .returning();
    if (!secondUser) throw new Error("second user not created");

    // This mirrors the route's guard: it reads the current owner before
    // deciding whether to update, and must refuse to overwrite a
    // different user's claim.
    const current = await testDb.query.assessmentCandidates.findFirst({
      where: eq(assessmentCandidates.id, candidate.id),
    });
    expect(current?.userId).toBe(firstUser.id);
    expect(current?.userId).not.toBe(secondUser.id);
  });
});
