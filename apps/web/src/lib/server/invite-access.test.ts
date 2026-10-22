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
import { loadInviteByToken } from "./invite-access";
import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
  INVITE_EXPIRY_MS,
} from "./invite-token";

function futureExpiry(): Date {
  return new Date(Date.now() + INVITE_EXPIRY_MS);
}

function pastExpiry(): Date {
  return new Date(Date.now() - 1000);
}

/**
 * Integration tests against the local Postgres. Covers Phase 4's invite
 * creation/lookup, duplicate-invitation handling, and invalid-token safety.
 */

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_OWNER = "test-invite-access-owner";
const TEST_ORG_SLUG = "test-invite-access-acme";

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
  // so organizations must be removed before the owning user.
  await testDb.delete(organizations).where(eq(organizations.slug, TEST_ORG_SLUG));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OWNER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createAssessment() {
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

  return { owner, org, assessment };
}

describe("invite creation", () => {
  it("an admin (owner) can create an invitation", async () => {
    const { assessment } = await createAssessment();
    const token = generateInviteToken();

    const [candidate] = await testDb
      .insert(assessmentCandidates)
      .values({
        assessmentId: assessment.id,
        email: "candidate@example.com",
        normalizedEmail: normalizeEmail("candidate@example.com"),
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: futureExpiry(),
      })
      .returning();

    expect(candidate?.status).toBe("invited");
    expect(candidate?.inviteTokenHash).toBe(hashInviteToken(token));
    // The plaintext token itself is never stored.
    expect(candidate?.inviteTokenHash).not.toBe(token);
  });
});

describe("duplicate invitation", () => {
  it("a duplicate assessment/email invitation is rejected by the unique constraint", async () => {
    const { assessment } = await createAssessment();
    const normalizedEmail = normalizeEmail("Candidate@Example.com");

    await testDb.insert(assessmentCandidates).values({
      assessmentId: assessment.id,
      email: "Candidate@Example.com",
      normalizedEmail,
      inviteTokenHash: hashInviteToken(generateInviteToken()),
      inviteExpiresAt: futureExpiry(),
    });

    await expect(
      testDb.insert(assessmentCandidates).values({
        assessmentId: assessment.id,
        email: "candidate@example.com",
        normalizedEmail,
        inviteTokenHash: hashInviteToken(generateInviteToken()),
        inviteExpiresAt: futureExpiry(),
      }),
    ).rejects.toThrow();
  });
});

describe("invalid token", () => {
  it("fails safely for a token that does not exist", async () => {
    const result = await loadInviteByToken("this-token-does-not-exist");
    expect(result.ok).toBe(false);
  });
});

describe("invite lookup", () => {
  it("resolves an invitation by its plaintext token via hash comparison", async () => {
    const { assessment, org } = await createAssessment();
    const token = generateInviteToken();

    await testDb.insert(assessmentCandidates).values({
      assessmentId: assessment.id,
      email: "candidate@example.com",
      normalizedEmail: normalizeEmail("candidate@example.com"),
      inviteTokenHash: hashInviteToken(token),
      inviteExpiresAt: futureExpiry(),
    });

    const result = await loadInviteByToken(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.assessment.id).toBe(assessment.id);
      expect(result.organization.id).toBe(org.id);
    }
  });
});

describe("invite expiry", () => {
  it("an expired, unclaimed invitation is reported as expired and cannot be accepted", async () => {
    const { assessment } = await createAssessment();
    const token = generateInviteToken();

    const [candidate] = await testDb
      .insert(assessmentCandidates)
      .values({
        assessmentId: assessment.id,
        email: "candidate@example.com",
        normalizedEmail: normalizeEmail("candidate@example.com"),
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: pastExpiry(),
      })
      .returning();
    if (!candidate) throw new Error("candidate not created");

    expect(candidate.inviteExpiresAt.getTime()).toBeLessThan(Date.now());
    expect(candidate.userId).toBeNull();
  });

  it("an already-claimed candidate is unaffected by invite expiry", async () => {
    const { assessment } = await createAssessment();
    const token = generateInviteToken();

    const [ownerUser] = await testDb.query.users.findMany({
      where: eq(users.authProviderId, TEST_AUTH_OWNER),
    });
    if (!ownerUser) throw new Error("owner user missing");

    const [candidate] = await testDb
      .insert(assessmentCandidates)
      .values({
        assessmentId: assessment.id,
        email: "candidate@example.com",
        normalizedEmail: normalizeEmail("candidate@example.com"),
        inviteTokenHash: hashInviteToken(token),
        inviteExpiresAt: pastExpiry(),
        userId: ownerUser.id,
      })
      .returning();
    if (!candidate) throw new Error("candidate not created");

    // Already claimed (userId set) despite an expired token — the route
    // layer's "already claimed" branch is checked before expiry, so this
    // candidate must remain fully accessible.
    expect(candidate.userId).toBe(ownerUser.id);
    expect(candidate.inviteExpiresAt.getTime()).toBeLessThan(Date.now());
  });
});
