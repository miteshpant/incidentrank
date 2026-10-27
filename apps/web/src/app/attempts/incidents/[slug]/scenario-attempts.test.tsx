import { render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, scenarios, users, attempts, type Db } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";

const TEST_AUTH_ID = "test-scenario-attempts-page";
const OTHER_AUTH_ID = "test-scenario-attempts-other-user";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Scenario Attempts Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

describe("ScenarioAttempts", () => {
  let testDb: Db;
  let ScenarioAttempts: typeof import("./scenario-attempts").ScenarioAttempts;
  let scenarioId: string;

  beforeAll(async () => {
    testDb = createDb();
    ({ ScenarioAttempts } = await import("./scenario-attempts"));

    const scenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });
    if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
    scenarioId = scenario.id;

    await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Scenario Attempts Tester" });
    await testDb
      .insert(users)
      .values({ authProviderId: OTHER_AUTH_ID, displayName: "Other User" });
  }, 30_000);

  afterEach(async () => {
    for (const authId of [TEST_AUTH_ID, OTHER_AUTH_ID]) {
      const user = await testDb.query.users.findFirst({
        where: eq(users.authProviderId, authId),
      });
      if (user) {
        await testDb.delete(attempts).where(eq(attempts.userId, user.id));
      }
    }
  });

  afterAll(async () => {
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
    await testDb.delete(users).where(eq(users.authProviderId, OTHER_AUTH_ID));
    await testDb.$client.end({ timeout: 1 });
  });

  it("renders the scenario's description and the signed-in user's attempts against it", async () => {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (!user) throw new Error("fixture user not found");

    await testDb.insert(attempts).values({
      userId: user.id,
      scenarioId,
      scenarioVersion: paymentRetryStorm.version,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      completionTier: "optimal",
      score: 742,
      recoveryScore: 200,
      customerImpactScore: 150,
      dataIntegrityScore: 200,
      reliabilityScore: 100,
      costEfficiencyScore: 72,
      operationalEfficiencyScore: 20,
      recoveryTimeMs: 65_000,
    });

    const element = await ScenarioAttempts({ slug: "payment-retry-storm" });
    render(element);

    expect(
      screen.getByRole("heading", { name: "Payment Retry Storm" }),
    ).toBeInTheDocument();
    expect(screen.getByText(paymentRetryStorm.description)).toBeInTheDocument();
    expect(screen.getByText("742 / 1000")).toBeInTheDocument();
  });

  it("never renders an assessment attempt's score, even though the candidate owns it", async () => {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (!user) throw new Error("fixture user not found");

    await testDb.insert(attempts).values({
      userId: user.id,
      scenarioId,
      scenarioVersion: paymentRetryStorm.version,
      attemptType: "assessment",
      status: "completed",
      outcome: "resolved",
      completionTier: "optimal",
      score: 905,
      recoveryScore: 300,
      customerImpactScore: 200,
      dataIntegrityScore: 200,
      reliabilityScore: 150,
      costEfficiencyScore: 55,
      operationalEfficiencyScore: 0,
      recoveryTimeMs: 80_000,
    });

    const element = await ScenarioAttempts({ slug: "payment-retry-storm" });
    render(element);

    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.queryByText(/905/)).not.toBeInTheDocument();
  });

  it("never includes another user's attempts against the same scenario", async () => {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    const other = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, OTHER_AUTH_ID),
    });
    if (!user || !other) throw new Error("fixture user not found");

    await testDb.insert(attempts).values({
      userId: user.id,
      scenarioId,
      scenarioVersion: paymentRetryStorm.version,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      completionTier: "acceptable",
      score: 650,
    });
    await testDb.insert(attempts).values({
      userId: other.id,
      scenarioId,
      scenarioVersion: paymentRetryStorm.version,
      attemptType: "practice",
      status: "completed",
      outcome: "resolved",
      completionTier: "optimal",
      score: 999,
    });

    const element = await ScenarioAttempts({ slug: "payment-retry-storm" });
    render(element);

    expect(screen.getByText("650 / 1000")).toBeInTheDocument();
    expect(screen.queryByText("999 / 1000")).not.toBeInTheDocument();
  });

  it("calls notFound for an unknown scenario slug", async () => {
    await expect(
      ScenarioAttempts({ slug: "no-such-scenario" }),
    ).rejects.toThrow();
  });

  it("calls notFound when the signed-in user has no attempts for a real scenario", async () => {
    await expect(
      ScenarioAttempts({ slug: "payment-retry-storm" }),
    ).rejects.toThrow();
  });
});
