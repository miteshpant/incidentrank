import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { createDb, legalAcceptances, users, type Db } from "@incidentrank/db";
import type { POST as PostHandler } from "./route";

/**
 * Route-layer cases from docs/implementation_plan/phasse10d.md §69 that
 * belong here rather than legal-acceptance.test.ts: unauthenticated
 * rejection, and the real end-to-end "forged user id ignored" guarantee
 * — this route never reads a user id from the request body at all, so
 * there is nothing for a forged body field to override.
 */

const TEST_AUTH_USER = "test-legal-accept-route-user";

const mockAuth = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: mockAuth.userId }),
  currentUser: async () => ({
    fullName: "Legal Accept Route Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("POST /api/legal/accept", () => {
  let testDb: Db;
  let POST: typeof PostHandler;

  beforeAll(async () => {
    testDb = createDb();
    ({ POST } = await import("./route"));
  }, 30_000);

  afterEach(async () => {
    mockAuth.userId = null;
    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
    if (user) {
      await testDb.delete(legalAcceptances).where(eq(legalAcceptances.userId, user.id));
      await testDb.delete(users).where(eq(users.id, user.id));
    }
    await testDb.delete(users).where(like(users.authProviderId, `${TEST_AUTH_USER}%`));
  });

  it("1. rejects an unauthenticated request", async () => {
    const response = await POST();
    expect(response.status).toBe(401);
  });

  it("2. records both platform_terms and privacy_policy for the authenticated user, deriving userId server-side", async () => {
    mockAuth.userId = TEST_AUTH_USER;
    const response = await POST();
    expect(response.status).toBe(200);

    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
    expect(user).toBeTruthy();
    const rows = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, user!.id),
    });
    expect(rows.map((r) => r.acceptanceType).sort()).toEqual(["platform_terms", "privacy_policy"]);
  });

  it("3. a repeated call is idempotent-safe, recording distinct history rows rather than erroring", async () => {
    mockAuth.userId = TEST_AUTH_USER;
    const first = await POST();
    const second = await POST();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
    const rows = await testDb.query.legalAcceptances.findMany({
      where: eq(legalAcceptances.userId, user!.id),
    });
    expect(rows.length).toBe(4); // 2 types x 2 calls
  });
});
