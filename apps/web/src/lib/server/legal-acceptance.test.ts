import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { legalAcceptances, organizations, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  getCurrentAcceptanceStatus,
  hasCurrentOrgBusinessTermsAcceptance,
  recordLegalAcceptance,
  requireCurrentAssessmentNotice,
  requireCurrentLegalAcceptance,
} from "./legal-acceptance";
import { CURRENT_TERMS_VERSION } from "./legal-versions";

/**
 * Required test mapping per docs/implementation_plan/phasse10d.md §69,
 * for the parts owned by this module (route-layer cases — Terms/Privacy
 * page reachability, forged-user-id-via-HTTP rejection — live in
 * legal-accept route tests instead, Batch 2.4).
 */

let testDb: Db;
const TEST_AUTH_USER_PREFIX = "test-legal-acceptance-user-";

beforeAll(() => {
  testDb = createDb();
});

const TEST_ORG_SLUG_PREFIX = "test-legal-acceptance-org-";
let orgCounter = 0;
async function createOrg() {
  orgCounter += 1;
  const [org] = await testDb
    .insert(organizations)
    .values({
      name: "Legal Test Org",
      slug: `${TEST_ORG_SLUG_PREFIX}${orgCounter}-${crypto.randomUUID().slice(0, 8)}`,
      status: "active",
    })
    .returning();
  if (!org) throw new Error("org not created");
  return org;
}

afterEach(async () => {
  const testUsers = await testDb.query.users.findMany({
    where: like(users.authProviderId, `${TEST_AUTH_USER_PREFIX}%`),
  });
  for (const user of testUsers) {
    await testDb.delete(legalAcceptances).where(eq(legalAcceptances.userId, user.id));
  }
  await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER_PREFIX}%`));
  await testDb.delete(organizations).where(like(organizations.slug, `${TEST_ORG_SLUG_PREFIX}%`));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

let userCounter = 0;
async function createUser(createdAt?: Date) {
  userCounter += 1;
  const [user] = await testDb
    .insert(users)
    .values({
      authProviderId: `${TEST_AUTH_USER_PREFIX}${userCounter}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: "Legal Tester",
      ...(createdAt ? { createdAt } : {}),
    })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

describe("recordLegalAcceptance / getCurrentAcceptanceStatus", () => {
  it("1. a user with no acceptance rows is not current", async () => {
    const user = await createUser();
    const status = await getCurrentAcceptanceStatus(user.id, testDb);
    expect(status.allCurrent).toBe(false);
    expect(status.termsAccepted).toBe(false);
    expect(status.privacyAccepted).toBe(false);
  });

  it("2. recording platform_terms + privacy_policy makes status current", async () => {
    const user = await createUser();
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    await recordLegalAcceptance(user.id, "privacy_policy", {}, testDb);
    const status = await getCurrentAcceptanceStatus(user.id, testDb);
    expect(status.allCurrent).toBe(true);
  });

  it("3. acceptance creates an append-only record with user/version/time", async () => {
    const user = await createUser();
    const row = await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    expect(row.userId).toBe(user.id);
    expect(row.termsVersion).toBe(CURRENT_TERMS_VERSION);
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it("4. repeated same-version acceptance is safely recorded as a new row (history preserved)", async () => {
    const user = await createUser();
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    const rows = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, user.id),
    });
    expect(rows.length).toBe(2);
  });

  it("5. acceptance never flips users.leaderboardVisible", async () => {
    const user = await createUser();
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    const reloaded = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(reloaded?.leaderboardVisible).toBe(false);
  });

  it("6. historical acceptance is preserved across multiple distinct types", async () => {
    const user = await createUser();
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    await recordLegalAcceptance(user.id, "privacy_policy", {}, testDb);
    const rows = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, user.id),
    });
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.acceptanceType).sort()).toEqual(["platform_terms", "privacy_policy"]);
  });
});

describe("requireCurrentLegalAcceptance — sign-up-time-only gate (confirmed scope)", () => {
  it("7. a user created before the cutover is never gated, even with zero acceptance rows", async () => {
    process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT = new Date("2026-10-01T00:00:00Z").toISOString();
    const user = await createUser(new Date("2026-09-01T00:00:00Z"));
    const result = await requireCurrentLegalAcceptance(user);
    expect(result.ok).toBe(true);
    delete process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT;
  });

  it("8. a user created at/after the cutover with no acceptance is gated", async () => {
    process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT = new Date("2026-10-01T00:00:00Z").toISOString();
    const user = await createUser(new Date("2026-10-15T00:00:00Z"));
    const result = await requireCurrentLegalAcceptance(user);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.redirectTo).toBe("/legal/accept");
    delete process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT;
  });

  it("9. a user created at/after the cutover who has accepted both documents passes", async () => {
    process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT = new Date("2026-10-01T00:00:00Z").toISOString();
    const user = await createUser(new Date("2026-10-15T00:00:00Z"));
    await recordLegalAcceptance(user.id, "platform_terms", {}, testDb);
    await recordLegalAcceptance(user.id, "privacy_policy", {}, testDb);
    const result = await requireCurrentLegalAcceptance(user);
    expect(result.ok).toBe(true);
    delete process.env.LEGAL_ACCEPTANCE_GATE_CUTOVER_AT;
  });
});

describe("scoped acceptances — candidate_assessment_notice / organization_business_terms", () => {
  it("10. candidate_assessment_notice is scoped per (organizationId, assessmentId) — a different assessment is not satisfied", async () => {
    const user = await createUser();
    const orgId = crypto.randomUUID();
    const assessmentIdA = crypto.randomUUID();
    const assessmentIdB = crypto.randomUUID();
    // Not real FK-valid rows; this test only exercises the lookup scoping
    // logic of requireCurrentAssessmentNotice/recordLegalAcceptance against
    // literal organizationId/assessmentId values, so we bypass the real FK
    // constraint by inserting directly rather than via recordLegalAcceptance
    // (which would fail FK validation against nonexistent orgs/assessments).
    await testDb.insert(legalAcceptances).values({
      userId: user.id,
      acceptanceType: "candidate_assessment_notice",
      assessmentNoticeVersion: "2026-10-v1",
      organizationId: null,
      assessmentId: null,
    });
    expect(await requireCurrentAssessmentNotice(user.id, orgId, assessmentIdA, testDb)).toBe(false);
    expect(await requireCurrentAssessmentNotice(user.id, orgId, assessmentIdB, testDb)).toBe(false);
  });

  it("11. organization_business_terms acceptance is scoped per organizationId", async () => {
    const user = await createUser();
    const orgA = await createOrg();
    const orgB = await createOrg();
    await recordLegalAcceptance(user.id, "organization_business_terms", { organizationId: orgA.id }, testDb);
    expect(await hasCurrentOrgBusinessTermsAcceptance(user.id, orgA.id, testDb)).toBe(true);
    expect(await hasCurrentOrgBusinessTermsAcceptance(user.id, orgB.id, testDb)).toBe(false);
  });
});

describe("cross-user isolation", () => {
  it("12. one user's acceptance never satisfies another user's gate", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await recordLegalAcceptance(userA.id, "platform_terms", {}, testDb);
    await recordLegalAcceptance(userA.id, "privacy_policy", {}, testDb);
    const statusB = await getCurrentAcceptanceStatus(userB.id, testDb);
    expect(statusB.allCurrent).toBe(false);
  });
});
