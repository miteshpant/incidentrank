import { sql } from "drizzle-orm";
import { BUILT_IN_SCENARIO_CATALOG, listBuiltInScenarioEntries } from "@incidentrank/scenarios";
import { createDb } from "./client";
import { foundingEngineerAllocations, scenarios } from "./schema";

const FOUNDING_ENGINEER_SLOT_COUNT = 100;

/**
 * Seeds every scenario in BUILT_IN_SCENARIO_CATALOG — never a hardcoded
 * per-scenario insert — per docs/implementation_plan/phase6.md's
 * data-driven-registry mandate. Adding scenario #21 (or #101) to the
 * catalog seeds it automatically on the next `pnpm db:seed`; this file
 * is never touched. The insert's conflict target is the catalog's own
 * partial unique index (slug, scoped to ownershipType="incidentrank"),
 * so re-running the seed is always safe.
 *
 * Phase 10F: isFree/structure/domain are re-synced from the compiled
 * ScenarioDefinition on every run (onConflictDoUpdate, not
 * onConflictDoNothing) — these are catalog/editorial metadata only,
 * never read by evaluatePracticeAccess (apps/web/src/lib/
 * practice-access.ts, which stays driven by the code literal directly),
 * so keeping the DB mirror in sync is purely a querying convenience, not
 * a second source of truth to keep correct by hand. name/isActive/
 * visibility/status are intentionally left out of the update `set` —
 * those may be hand-edited via the admin portal after initial seeding
 * and must never be clobbered by a routine seed re-run.
 *
 * Also seeds exactly 100 Founding Engineer allocation slots (phase9.md
 * §22/§23) — the race-safe capacity model's fixed inventory. Each slot
 * starts userId=null, status='released' (i.e. "free"); reservation claims
 * the lowest-numbered free slot under FOR UPDATE SKIP LOCKED. Idempotent
 * via onConflictDoNothing on the unique slot_number index — re-running
 * this seed never creates duplicate or extra slots.
 */
async function main() {
  const db = createDb();

  const entries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG);
  for (const entry of entries) {
    const isFree = entry.definition.isFree;
    const structure = entry.definition.structure;
    const domain = entry.definition.library?.category ?? null;

    await db
      .insert(scenarios)
      .values({
        slug: entry.definition.slug,
        name: entry.definition.name,
        isActive: true,
        ownershipType: "incidentrank",
        visibility: "public",
        status: "published",
        isFree,
        structure,
        domain,
      })
      .onConflictDoUpdate({
        target: scenarios.slug,
        // Matches scenarios_builtin_slug_idx's own partial predicate
        // (packages/db/src/schema.ts) — Postgres requires an ON CONFLICT
        // target to match a partial unique index's WHERE clause exactly,
        // not just its columns, or the conflict silently fails to match.
        targetWhere: sql`${scenarios.ownershipType} = 'incidentrank'`,
        set: { isFree, structure, domain },
      });
  }

  const slots = Array.from({ length: FOUNDING_ENGINEER_SLOT_COUNT }, (_, i) => ({
    slotNumber: i + 1,
    status: "released" as const,
  }));
  await db.insert(foundingEngineerAllocations).values(slots).onConflictDoNothing();

  console.log(`Seed complete (${entries.length} built-in scenario(s)).`);
  console.log(`Founding Engineer slots seeded (${FOUNDING_ENGINEER_SLOT_COUNT}).`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
