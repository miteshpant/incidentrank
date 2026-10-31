import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, type Db } from "./client";
import { scenarios } from "./schema";
import { seedBuiltInScenarios } from "./seed";

/**
 * Integration tests against the local Postgres (see ../../docker-compose.yml).
 * Requires migrations to already be applied (`pnpm db:migrate`).
 *
 * Phase 10G: proves seedBuiltInScenarios' admin-override guard for
 * `isFree` — the exact regression the Phase 10G doc called out (seed
 * must stop silently clobbering an editorial free/paid decision).
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

// Any built-in scenario known to be isFree: false in code works as the
// "flip it to free via admin override" test subject.
const PAID_SLUG = "rate-limit-misconfiguration";
// Any built-in scenario known to be isFree: true in code — used to
// prove a non-overridden row still syncs normally.
const FREE_SLUG = "kafka-consumer-lag";

async function getRow(slug: string) {
  return db.query.scenarios.findFirst({
    where: and(eq(scenarios.slug, slug), eq(scenarios.ownershipType, "incidentrank")),
  });
}

describe("seedBuiltInScenarios — isFree admin-override persistence (Phase 10G)", () => {
  it("a non-overridden row's isFree stays synced from the code literal across re-runs", async () => {
    await seedBuiltInScenarios(db);
    const row = await getRow(FREE_SLUG);
    expect(row?.isFree).toBe(true);
    expect(row?.isFreeOverriddenByAdmin).toBe(false);

    // Re-run — still synced, still not overridden.
    await seedBuiltInScenarios(db);
    const rowAfter = await getRow(FREE_SLUG);
    expect(rowAfter?.isFree).toBe(true);
  });

  it("an admin-overridden isFree survives a later seed run, even though the code literal disagrees", async () => {
    // Baseline: seed first so the row genuinely exists with its code
    // default (isFree: false) before simulating an admin edit.
    await seedBuiltInScenarios(db);
    const baseline = await getRow(PAID_SLUG);
    expect(baseline?.isFree).toBe(false);

    // Simulate the admin editor's write path (apps/web/src/app/api/
    // admin/scenarios/[scenarioId]/route.ts, Phase 10G §2) setting
    // isFree=true and the override flag together.
    await db
      .update(scenarios)
      .set({ isFree: true, isFreeOverriddenByAdmin: true })
      .where(and(eq(scenarios.slug, PAID_SLUG), eq(scenarios.ownershipType, "incidentrank")));

    const afterOverride = await getRow(PAID_SLUG);
    expect(afterOverride?.isFree).toBe(true);
    expect(afterOverride?.isFreeOverriddenByAdmin).toBe(true);

    // The regression this test exists for: re-running seed must NOT
    // revert isFree back to the code literal (false) now that it's
    // admin-overridden.
    await seedBuiltInScenarios(db);
    const afterReseed = await getRow(PAID_SLUG);
    expect(afterReseed?.isFree).toBe(true);
    expect(afterReseed?.isFreeOverriddenByAdmin).toBe(true);

    // Clean up — restore the baseline state for any other test/process
    // sharing this database.
    await db
      .update(scenarios)
      .set({ isFree: false, isFreeOverriddenByAdmin: false })
      .where(and(eq(scenarios.slug, PAID_SLUG), eq(scenarios.ownershipType, "incidentrank")));
  });
});
