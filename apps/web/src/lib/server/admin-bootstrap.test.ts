import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { adminUsers, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { bootstrapOwnerIfEligible } from "./admin-bootstrap";

/**
 * Integration tests against the local Postgres for the Phase 8 first-owner
 * bootstrap flow (docs/implementation_plan/
 * phase8_admin_promotional_access_referrals.md §4.1, corrected by
 * phase8loc.md's Step 2/2A).
 */

let testDb: Db;

const TEST_AUTH_CANDIDATE = "test-admin-bootstrap-candidate";
const TEST_AUTH_WRONG_EMAIL = "test-admin-bootstrap-wrong-email";
const TEST_AUTH_OTHER = "test-admin-bootstrap-other";
const TEST_INITIAL_ADMIN_EMAIL = "bootstrap-owner@incidentrank.com";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  const candidates = await testDb.query.users.findMany({
    where: (table, { inArray }) =>
      inArray(table.authProviderId, [
        TEST_AUTH_CANDIDATE,
        TEST_AUTH_WRONG_EMAIL,
        TEST_AUTH_OTHER,
      ]),
  });
  for (const user of candidates) {
    await testDb.delete(adminUsers).where(eq(adminUsers.userId, user.id));
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_CANDIDATE));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_WRONG_EMAIL));
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_OTHER));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser(authProviderId: string, displayName: string) {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId, displayName })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

describe("bootstrapOwnerIfEligible", () => {
  it("creates the owner when the verified email exactly matches INITIAL_ADMIN_EMAIL", async () => {
    vi.stubEnv("INITIAL_ADMIN_EMAIL", TEST_INITIAL_ADMIN_EMAIL);
    const user = await createUser(TEST_AUTH_CANDIDATE, "Candidate");

    const result = await bootstrapOwnerIfEligible(user, TEST_INITIAL_ADMIN_EMAIL);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.membership.role).toBe("owner");
      expect(result.membership.userId).toBe(user.id);
      expect(result.justBootstrapped).toBe(true);
    }
    vi.unstubAllEnvs();
  });

  it("denies a verified email that does not exactly match (no normalization)", async () => {
    vi.stubEnv("INITIAL_ADMIN_EMAIL", TEST_INITIAL_ADMIN_EMAIL);
    const user = await createUser(TEST_AUTH_WRONG_EMAIL, "Wrong Email");

    // A plus-addressed variant of the correct email must NOT match —
    // phase8loc.md: "Do not normalize mpant+anything@... to mpant@...".
    const plusAddressed = TEST_INITIAL_ADMIN_EMAIL.replace(
      "@",
      "+anything@",
    );
    const result = await bootstrapOwnerIfEligible(user, plusAddressed);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("wrong_email");
    }
    vi.unstubAllEnvs();
  });

  it("is idempotent for the same already-bootstrapped owner", async () => {
    vi.stubEnv("INITIAL_ADMIN_EMAIL", TEST_INITIAL_ADMIN_EMAIL);
    const user = await createUser(TEST_AUTH_CANDIDATE, "Candidate");

    const first = await bootstrapOwnerIfEligible(user, TEST_INITIAL_ADMIN_EMAIL);
    const second = await bootstrapOwnerIfEligible(user, TEST_INITIAL_ADMIN_EMAIL);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.membership.id).toBe(first.membership.id);
      expect(second.justBootstrapped).toBe(false);
    }
    vi.unstubAllEnvs();
  });

  it("denies bootstrap once another user has already become owner", async () => {
    vi.stubEnv("INITIAL_ADMIN_EMAIL", TEST_INITIAL_ADMIN_EMAIL);
    const first = await createUser(TEST_AUTH_CANDIDATE, "First Owner");
    const second = await createUser(TEST_AUTH_OTHER, "Second Claimant");

    const firstResult = await bootstrapOwnerIfEligible(first, TEST_INITIAL_ADMIN_EMAIL);
    expect(firstResult.ok).toBe(true);

    const secondResult = await bootstrapOwnerIfEligible(second, TEST_INITIAL_ADMIN_EMAIL);
    expect(secondResult.ok).toBe(false);
    if (!secondResult.ok) {
      expect(secondResult.reason).toBe("already_bootstrapped");
    }
    vi.unstubAllEnvs();
  });

  it("two simultaneous first-bootstrap requests create exactly one owner", async () => {
    vi.stubEnv("INITIAL_ADMIN_EMAIL", TEST_INITIAL_ADMIN_EMAIL);
    const first = await createUser(TEST_AUTH_CANDIDATE, "Racer A");
    const second = await createUser(TEST_AUTH_OTHER, "Racer B");

    const [resultA, resultB] = await Promise.all([
      bootstrapOwnerIfEligible(first, TEST_INITIAL_ADMIN_EMAIL),
      bootstrapOwnerIfEligible(second, TEST_INITIAL_ADMIN_EMAIL),
    ]);

    const succeeded = [resultA, resultB].filter((r) => r.ok);
    const denied = [resultA, resultB].filter((r) => !r.ok);
    expect(succeeded.length).toBe(1);
    expect(denied.length).toBe(1);

    const owners = await testDb.query.adminUsers.findMany({
      where: eq(adminUsers.role, "owner"),
    });
    expect(owners.length).toBe(1);
    vi.unstubAllEnvs();
  });
});
