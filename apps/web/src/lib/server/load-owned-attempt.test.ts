import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, scenarios, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { loadOwnedAttempt } from "./load-owned-attempt";

/**
 * Integration test against the local Postgres. Exercises the Phase 3
 * authorization guarantee directly: a user may only load an attempt they
 * own. This is the server-side check every /api/attempts/[id]/* route and
 * the /attempts/[attemptId] page relies on.
 */

let testDb: Db;
let scenarioId: string;
let userAId: string;
let userBId: string;
let attemptOwnedByUserAId: string;

beforeAll(async () => {
  testDb = createDb();

  const scenario = await testDb.query.scenarios.findFirst({
    where: eq(scenarios.slug, "payment-retry-storm"),
  });
  if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
  scenarioId = scenario.id;

  const [userA] = await testDb
    .insert(users)
    .values({ authProviderId: "test-authz-user-a", displayName: "User A" })
    .returning();
  const [userB] = await testDb
    .insert(users)
    .values({ authProviderId: "test-authz-user-b", displayName: "User B" })
    .returning();
  if (!userA || !userB) throw new Error("fixtures not created");
  userAId = userA.id;
  userBId = userB.id;

  const [attempt] = await testDb
    .insert(attempts)
    .values({
      userId: userAId,
      scenarioId,
      scenarioVersion: paymentRetryStorm.version,
    })
    .returning();
  if (!attempt) throw new Error("attempt not created");
  attemptOwnedByUserAId = attempt.id;
});

afterAll(async () => {
  await testDb.delete(users).where(eq(users.authProviderId, "test-authz-user-a"));
  await testDb.delete(users).where(eq(users.authProviderId, "test-authz-user-b"));
  await testDb.$client.end({ timeout: 1 });
});

describe("loadOwnedAttempt", () => {
  it("allows the owner to load their own attempt", async () => {
    const result = await loadOwnedAttempt(attemptOwnedByUserAId, {
      id: userAId,
    } as never);

    expect(result.ok).toBe(true);
  });

  it("forbids a different user from loading someone else's attempt", async () => {
    const result = await loadOwnedAttempt(attemptOwnedByUserAId, {
      id: userBId,
    } as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it("returns 404 for a non-existent attempt id", async () => {
    const result = await loadOwnedAttempt(
      "00000000-0000-0000-0000-000000000000",
      { id: userAId } as never,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });
});
