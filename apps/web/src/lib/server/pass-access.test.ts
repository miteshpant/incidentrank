import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { incidentPasses, scenarios, users, type Db } from "@incidentrank/db";
import { createDb } from "@incidentrank/db";
import { bindIncidentPass, grantIncidentPass } from "./incident-passes";
import { getScenarioPassAccess } from "./pass-access";

let testDb: Db;

const TEST_AUTH_USER = "test-pass-access-user";
const TEST_SCENARIO_SLUG = "test-pass-access-scenario";
const TEST_OTHER_SCENARIO_SLUG = "test-pass-access-other-scenario";

beforeAll(async () => {
  testDb = createDb();
});

afterEach(async () => {
  const user = await testDb.query.users.findFirst({ where: eq(users.authProviderId, TEST_AUTH_USER) });
  if (user) {
    await testDb.delete(incidentPasses).where(eq(incidentPasses.userId, user.id));
  }
  await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_USER));
  await testDb.delete(scenarios).where(eq(scenarios.slug, TEST_SCENARIO_SLUG));
  await testDb.delete(scenarios).where(eq(scenarios.slug, TEST_OTHER_SCENARIO_SLUG));
});

afterAll(async () => {
  await testDb.$client.end({ timeout: 1 });
});

async function createUser() {
  const [user] = await testDb
    .insert(users)
    .values({ authProviderId: TEST_AUTH_USER, displayName: "Pass Access Tester" })
    .returning();
  if (!user) throw new Error("user not created");
  return user;
}

async function createScenario(slug: string) {
  const [scenario] = await testDb
    .insert(scenarios)
    .values({ slug, name: slug, ownershipType: "incidentrank", isActive: true })
    .returning();
  if (!scenario) throw new Error("scenario not created");
  return scenario;
}

describe("getScenarioPassAccess", () => {
  it("returns null state for an anonymous (no userId) caller", async () => {
    const scenario = await createScenario(TEST_SCENARIO_SLUG);
    const result = await getScenarioPassAccess(null, scenario.id);
    expect(result.state).toBeNull();
  });

  it("returns null state when the user has no pass", async () => {
    const user = await createUser();
    const scenario = await createScenario(TEST_SCENARIO_SLUG);
    const result = await getScenarioPassAccess(user.id, scenario.id);
    expect(result.state).toBeNull();
  });

  it("returns 'available' for an unbound pass", async () => {
    const user = await createUser();
    const scenario = await createScenario(TEST_SCENARIO_SLUG);
    await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });

    const result = await getScenarioPassAccess(user.id, scenario.id);
    expect(result.state).toBe("available");
  });

  it("returns 'bound_here' for the scenario the pass is bound to", async () => {
    const user = await createUser();
    const scenario = await createScenario(TEST_SCENARIO_SLUG);
    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });

    const result = await getScenarioPassAccess(user.id, scenario.id);
    expect(result.state).toBe("bound_here");
  });

  it("returns 'bound_elsewhere' for a different scenario than the pass is bound to", async () => {
    const user = await createUser();
    const scenario = await createScenario(TEST_SCENARIO_SLUG);
    const otherScenario = await createScenario(TEST_OTHER_SCENARIO_SLUG);
    const pass = await grantIncidentPass(testDb, { userId: user.id, sourceType: "admin_grant" });
    if (!pass) throw new Error("pass not granted");
    await bindIncidentPass(testDb, { passId: pass.id, userId: user.id, scenario });

    const result = await getScenarioPassAccess(user.id, otherScenario.id);
    expect(result.state).toBe("bound_elsewhere");
    expect(result.boundScenarioId).toBe(scenario.id);
  });
});
