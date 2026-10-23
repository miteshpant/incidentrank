import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { attempts, scenarios, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";

let testDb: Db;
let scenarioId: string;
let scenarioVersion: number;

const TEST_AUTH_ID = "test-attempts-lifecycle";

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
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

describe("attempt lifecycle", () => {
  it("records the scenario version on creation", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Version Tester" })
      .returning();
    if (!user) throw new Error("user not created");

    const [attempt] = await testDb
      .insert(attempts)
      .values({ userId: user.id, scenarioId, scenarioVersion })
      .returning();

    expect(attempt?.scenarioVersion).toBe(scenarioVersion);
  });

  it("retrying creates a new, independent attempt record rather than modifying the first", async () => {
    const [user] = await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Retry Tester" })
      .returning();
    if (!user) throw new Error("user not created");

    const [first] = await testDb
      .insert(attempts)
      .values({
        userId: user.id,
        scenarioId,
        scenarioVersion,
        status: "completed",
        outcome: "resolved",
        score: 980,
      })
      .returning();

    const [second] = await testDb
      .insert(attempts)
      .values({
        userId: user.id,
        scenarioId,
        scenarioVersion,
        status: "completed",
        outcome: "failed",
        score: 435,
      })
      .returning();

    expect(first?.id).not.toBe(second?.id);

    const rows = await testDb.query.attempts.findMany({
      where: eq(attempts.userId, user.id),
    });
    expect(rows).toHaveLength(2);

    const refetchedFirst = await testDb.query.attempts.findFirst({
      where: eq(attempts.id, first!.id),
    });
    expect(refetchedFirst?.score).toBe(980);
    expect(refetchedFirst?.status).toBe("completed");
    expect(refetchedFirst?.outcome).toBe("resolved");
  });
});
