import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  incidentPasses,
  scenarios,
  users,
  type Db,
} from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import {
  bindIncidentPass,
  consumeIncidentPass,
  findAvailableOrBoundPass,
  findPassBySource,
  findPassForScenario,
  grantIncidentPass,
} from "./incident-passes";

let testDb: Db;

const TEST_AUTH_USER = "test-incident-passes-user";
const TEST_SCENARIO_SLUG = "test-incident-passes-scenario";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  const user = await testDb.query.users.findFirst({
    where: eq(users.authProviderId, TEST_AUTH_USER),
  });
  if (user) {
    await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_USER));
  await testDb.delete(scenarios).where(eq(scenarios.slug, TEST_SCENARIO_SLUG));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser() {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_USER, displayName: "Pass Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createScenario(overrides?: { isActive?: boolean }) {
  const [scenario] = await testDb
    .insert(scenarios)
    .values({
      slug: TEST_SCENARIO_SLUG,
      name: "Test Incident Passes Scenario",
      ownershipType: "incidentrank",
      isActive: overrides?.isActive ?? true,
    })
    .returning();
  if (!scenario) throw new Error("scenario not created");
  return scenario;
}

describe("grantIncidentPass", () => {
  it("creates exactly one available pass per source", async () => {
    const user = await createUser();
    const sourceId = crypto.randomUUID();

    const first = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "promo_invite",
      sourceId,
    });
    expect(first?.status).toBe("available");

    const second = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "promo_invite",
      sourceId,
    });
    expect(second).toBeNull();

    const found = await findPassBySource("promo_invite", sourceId);
    expect(found?.id).toBe(first?.id);
  });

  it("allows multiple ad-hoc admin_grant passes with no sourceId", async () => {
    const user = await createUser();

    const first = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    const second = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.id).not.toBe(second?.id);
  });
});

describe("bindIncidentPass", () => {
  it("binds an available pass to one scenario", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");

    const result = await bindIncidentPass(testDb, {
      passId: pass.id,
      userId: user.id,
      scenario,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pass.status).toBe("bound");
      expect(result.pass.scenarioId).toBe(scenario.id);
    }
  });

  it("cannot bind a pass to two scenarios — a second bind attempt fails", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");

    const first = await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });
    expect(first.ok).toBe(true);

    const second = await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("not_available");
  });

  it("concurrent bind requests for the same pass are safe — exactly one succeeds", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");

    const [a, b] = await Promise.all([
      bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario }),
      bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario }),
    ]);

    const succeeded = [a, b].filter((r) => r.ok);
    expect(succeeded.length).toBe(1);
  });

  it("a non-owner cannot bind another user's pass", async () => {
    const owner = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: owner.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");

    const [otherUser] = await testDb
      .insert(users)
      .values({ authProviderId: "test-incident-passes-other", displayName: "Other" })
      .returning();
    if (!otherUser) throw new Error("other user not created");

    try {
      const result = await bindIncidentPass(testDb, {
        passId: pass.id,
        userId: otherUser.id,
        scenario,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("not_owner");
    } finally {
      await testDb.delete(users).where(eq(users.id, otherUser.id));
    }
  });
});

describe("consumeIncidentPass", () => {
  it("consumes a pass bound to the started scenario", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });

    const result = await consumeIncidentPass(testDb, {
      passId: pass.id,
      userId: user.id,
      scenarioId: scenario.id,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pass.status).toBe("consumed");
  });

  it("a consumed pass cannot be consumed again", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });
    await consumeIncidentPass(testDb, { passId: pass.id, userId: user.id, scenarioId: scenario.id });

    const second = await consumeIncidentPass(testDb, {
      passId: pass.id,
      userId: user.id,
      scenarioId: scenario.id,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("not_bound_to_scenario");
  });

  it("concurrent consumption attempts cannot double-consume — exactly one succeeds", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });

    const [a, b] = await Promise.all([
      consumeIncidentPass(testDb, { passId: pass.id, userId: user.id, scenarioId: scenario.id }),
      consumeIncidentPass(testDb, { passId: pass.id, userId: user.id, scenarioId: scenario.id }),
    ]);

    const succeeded = [a, b].filter((r) => r.ok);
    expect(succeeded.length).toBe(1);
  });
});

describe("findAvailableOrBoundPass / findPassForScenario", () => {
  it("finds the user's available pass", async () => {
    const user = await createUser();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");

    const found = await findAvailableOrBoundPass(user.id);
    expect(found?.id).toBe(pass.id);
  });

  it("returns null once the pass is consumed", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });
    await consumeIncidentPass(testDb, { passId: pass.id, userId: user.id, scenarioId: scenario.id });

    const found = await findAvailableOrBoundPass(user.id);
    expect(found).toBeNull();
  });

  it("finds the pass bound to a specific scenario", async () => {
    const user = await createUser();
    const scenario = await createScenario();
    const pass = await grantIncidentPass(testDb, {
      userId: user.id,
      sourceType: "admin_grant",
    });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });

    const found = await findPassForScenario(user.id, scenario.id);
    expect(found?.id).toBe(pass.id);
  });
});
