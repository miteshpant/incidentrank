import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "./client";
import {
  attemptActionChanges,
  attemptActionGroups,
  attemptEvents,
  attempts,
  organizations,
  scenarios,
  users,
} from "./schema";

/**
 * Integration tests against the local Postgres (see ../../docker-compose.yml).
 * Requires migrations to already be applied (`pnpm db:migrate`).
 */

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://incidentrank:incidentrank@localhost:5433/incidentrank";

let db: Db;

beforeAll(() => {
  db = createDb(TEST_DATABASE_URL);
});

afterAll(async () => {
  await db.$client.end({ timeout: 1 });
});

beforeEach(async () => {
  // Attempts cascade-delete their groups/changes/events; users cascade-delete attempts.
  await db.delete(users).where(eq(users.authProviderId, "test-auth-provider-id"));
});

describe("users", () => {
  it("enforces a unique authProviderId", async () => {
    await db.insert(users).values({
      authProviderId: "test-auth-provider-id",
      displayName: "Test Engineer",
    });

    await expect(
      db.insert(users).values({
        authProviderId: "test-auth-provider-id",
        displayName: "Duplicate",
      }),
    ).rejects.toThrow();
  });

  it("defaults leaderboardVisible to false", async () => {
    const [user] = await db
      .insert(users)
      .values({
        authProviderId: "test-auth-provider-id",
        displayName: "Test Engineer",
      })
      .returning();

    expect(user?.leaderboardVisible).toBe(false);
  });
});

describe("scenarios", () => {
  it("seeds the payment-retry-storm scenario", async () => {
    const row = await db.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });

    expect(row).toBeDefined();
    expect(row?.isActive).toBe(true);
    expect(row?.ownershipType).toBe("incidentrank");
  });
});

/**
 * Task #18 (docs/implementation_plan/phase6.md's data-driven-registry
 * mandate, per the user's explicit schema-migration spec): scenarios.slug
 * uniqueness is scoped per ownership namespace via partial unique
 * indexes, not one global unique index — an organization's private
 * scenario slug and an IncidentRank-owned built-in scenario's slug may
 * legitimately coincide (this collided for real during Phase 6 and drove
 * this migration).
 */
describe("scenarios — per-namespace slug uniqueness", () => {
  const TEST_SLUG = "test-slug-scoping-collision";

  beforeEach(async () => {
    await db.delete(scenarios).where(eq(scenarios.slug, TEST_SLUG));
    await db.delete(organizations).where(eq(organizations.slug, "test-slug-scoping-org-a"));
    await db.delete(organizations).where(eq(organizations.slug, "test-slug-scoping-org-b"));
  });

  afterAll(async () => {
    await db.delete(scenarios).where(eq(scenarios.slug, TEST_SLUG));
    await db.delete(organizations).where(eq(organizations.slug, "test-slug-scoping-org-a"));
    await db.delete(organizations).where(eq(organizations.slug, "test-slug-scoping-org-b"));
  });

  it("allows a built-in scenario and an organization-owned scenario to share the same slug", async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: "Slug Scoping Org A", slug: "test-slug-scoping-org-a" })
      .returning();
    if (!org) throw new Error("org not created");

    await db.insert(scenarios).values({
      slug: TEST_SLUG,
      name: "Built-in with shared slug",
      ownershipType: "incidentrank",
    });

    await expect(
      db.insert(scenarios).values({
        slug: TEST_SLUG,
        name: "Org-owned with shared slug",
        ownershipType: "organization",
        organizationId: org.id,
      }),
    ).resolves.not.toThrow();
  });

  it("rejects a second built-in scenario with a duplicate slug", async () => {
    await db.insert(scenarios).values({
      slug: TEST_SLUG,
      name: "First built-in",
      ownershipType: "incidentrank",
    });

    await expect(
      db.insert(scenarios).values({
        slug: TEST_SLUG,
        name: "Duplicate built-in",
        ownershipType: "incidentrank",
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate slug within the same organization but allows it across different organizations", async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: "Slug Scoping Org A", slug: "test-slug-scoping-org-a" })
      .returning();
    const [orgB] = await db
      .insert(organizations)
      .values({ name: "Slug Scoping Org B", slug: "test-slug-scoping-org-b" })
      .returning();
    if (!orgA || !orgB) throw new Error("orgs not created");

    await db.insert(scenarios).values({
      slug: TEST_SLUG,
      name: "Org A's scenario",
      ownershipType: "organization",
      organizationId: orgA.id,
    });

    await expect(
      db.insert(scenarios).values({
        slug: TEST_SLUG,
        name: "Org A's duplicate",
        ownershipType: "organization",
        organizationId: orgA.id,
      }),
    ).rejects.toThrow();

    await expect(
      db.insert(scenarios).values({
        slug: TEST_SLUG,
        name: "Org B's scenario",
        ownershipType: "organization",
        organizationId: orgB.id,
      }),
    ).resolves.not.toThrow();
  });
});

describe("attempts and immutable history", () => {
  it("cascades delete from attempt to action groups, changes, and events", async () => {
    const [user] = await db
      .insert(users)
      .values({
        authProviderId: "test-auth-provider-id",
        displayName: "Test Engineer",
      })
      .returning();
    const scenario = await db.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });
    if (!user || !scenario) throw new Error("fixtures missing");

    const [attempt] = await db
      .insert(attempts)
      .values({
        userId: user.id,
        scenarioId: scenario.id,
        // Payment Retry Storm's ScenarioDefinition.version (packages/scenarios)
        // is authoritative for built-in scenarios; the DB row carries no
        // version column (see schema.ts comment on `scenarios`).
        scenarioVersion: 1,
        status: "resolved",
        score: 980,
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    const [group] = await db
      .insert(attemptActionGroups)
      .values({
        attemptId: attempt.id,
        sequence: 0,
        elapsedMs: 65_000,
        reasoning: "Reduce retry amplification.",
      })
      .returning();
    if (!group) throw new Error("group not created");

    await db.insert(attemptActionChanges).values({
      actionGroupId: group.id,
      sequence: 0,
      controlKey: "retries",
      previousValueJson: 3,
      newValueJson: 1,
    });

    await db.insert(attemptEvents).values({
      attemptId: attempt.id,
      sequence: 0,
      elapsedMs: 65_000,
      type: "CONFIG_CHANGED",
      message: "retries changed.",
    });

    await db.delete(attempts).where(eq(attempts.id, attempt.id));

    const remainingGroups = await db.query.attemptActionGroups.findMany({
      where: eq(attemptActionGroups.attemptId, attempt.id),
    });
    const remainingChanges = await db.query.attemptActionChanges.findMany({
      where: eq(attemptActionChanges.actionGroupId, group.id),
    });
    const remainingEvents = await db.query.attemptEvents.findMany({
      where: eq(attemptEvents.attemptId, attempt.id),
    });

    expect(remainingGroups).toHaveLength(0);
    expect(remainingChanges).toHaveLength(0);
    expect(remainingEvents).toHaveLength(0);
  });

  it("enforces unique (attemptId, sequence) for action groups", async () => {
    const [user] = await db
      .insert(users)
      .values({
        authProviderId: "test-auth-provider-id",
        displayName: "Test Engineer",
      })
      .returning();
    const scenario = await db.query.scenarios.findFirst({
      where: eq(scenarios.slug, "payment-retry-storm"),
    });
    if (!user || !scenario) throw new Error("fixtures missing");

    const [attempt] = await db
      .insert(attempts)
      .values({
        userId: user.id,
        scenarioId: scenario.id,
        // Payment Retry Storm's ScenarioDefinition.version (packages/scenarios)
        // is authoritative for built-in scenarios; the DB row carries no
        // version column (see schema.ts comment on `scenarios`).
        scenarioVersion: 1,
      })
      .returning();
    if (!attempt) throw new Error("attempt not created");

    await db.insert(attemptActionGroups).values({
      attemptId: attempt.id,
      sequence: 0,
      elapsedMs: 1000,
    });

    await expect(
      db.insert(attemptActionGroups).values({
        attemptId: attempt.id,
        sequence: 0,
        elapsedMs: 2000,
      }),
    ).rejects.toThrow();
  });
});
