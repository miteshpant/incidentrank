import { render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, scenarios, users, attempts, type Db } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";

const TEST_AUTH_ID = "test-attempts-list-privacy";

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: TEST_AUTH_ID }),
  currentUser: async () => ({
    fullName: "Attempts List Privacy Tester",
    username: null,
    primaryEmailAddress: null,
  }),
}));

/**
 * Phase 7.3 regression (still enforced after the Phase 8.1 group-by-
 * scenario rewrite): GET /attempts (the candidate's own "Your Attempts"
 * history) must never surface a raw score for a company-assessment
 * attempt. Originally this meant a flat per-attempt row; now grouping
 * means the regression is "an assessment attempt's score must never
 * leak into its scenario group's Best Score column" — an unredacted
 * group-level aggregate would be just as real a leak as an unredacted
 * row once was. Each test uses its own scenario so the two attempts
 * inserted across this file never group together and interfere with
 * each other's assertions.
 */
describe("AttemptsList — group-by-scenario privacy and aggregation", () => {
  let testDb: Db;
  let AttemptsList: typeof import("./attempts-list").AttemptsList;
  let scenarioId: string;

  beforeAll(async () => {
    testDb = createDb();
    ({ AttemptsList } = await import("./attempts-list"));

    const scenario = await testDb.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });
    if (!scenario) throw new Error("seed scenario missing — run pnpm db:seed");
    scenarioId = scenario.id;

    await testDb
      .insert(users)
      .values({ authProviderId: TEST_AUTH_ID, displayName: "Attempts List Privacy Tester" })
      .returning();
  }, 30_000);

  afterEach(async () => {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (user) {
      await testDb.delete(attempts).where(eq(attempts.userId, user.id));
    }
  });

  afterAll(async () => {
    await testDb.delete(users).where(eq(users.authProviderId, TEST_AUTH_ID));
    await testDb.$client.end({ timeout: 1 });
  });

  it("never renders an assessment attempt's score as the scenario group's Best Score", async () => {
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

    const element = await AttemptsList();
    render(element);

    expect(screen.getByText("Payment Retry Storm")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument(); // attempt count
    expect(screen.getByText("—")).toBeInTheDocument(); // Best Score withheld
    expect(screen.queryByText(/905/)).not.toBeInTheDocument();
  });

  it("renders the real Best Score and attempt count for practice attempts", async () => {
    const user = await testDb.query.users.findFirst({
      where: eq(users.authProviderId, TEST_AUTH_ID),
    });
    if (!user) throw new Error("fixture user not found");

    await testDb.insert(attempts).values([
      {
        userId: user.id,
        scenarioId,
        scenarioVersion: paymentRetryStorm.version,
        attemptType: "practice",
        status: "completed",
        outcome: "resolved",
        completionTier: "acceptable",
        score: 600,
        recoveryScore: 150,
        customerImpactScore: 150,
        dataIntegrityScore: 150,
        reliabilityScore: 75,
        costEfficiencyScore: 55,
        operationalEfficiencyScore: 20,
        recoveryTimeMs: 90_000,
      },
      {
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
      },
    ]);

    const element = await AttemptsList();
    render(element);

    expect(screen.getByText("Payment Retry Storm")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // attempt count
    expect(screen.getByText("742 / 1000")).toBeInTheDocument(); // best of 600/742
    expect(screen.queryByText("600 / 1000")).not.toBeInTheDocument();
  });

  it("links the scenario row to /attempts/incidents/[slug]", async () => {
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

    const element = await AttemptsList();
    render(element);

    const link = screen.getByText("Payment Retry Storm").closest("a");
    expect(link).toHaveAttribute("href", "/attempts/incidents/payment-retry-storm");
  });
});
