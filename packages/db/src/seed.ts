import { BUILT_IN_SCENARIO_CATALOG, listBuiltInScenarioEntries } from "@incidentrank/scenarios";
import { createDb } from "./client";
import { foundingEngineerAllocations, scenarios } from "./schema";

const FOUNDING_ENGINEER_SLOT_COUNT = 100;

/**
 * Seeds every scenario in BUILT_IN_SCENARIO_CATALOG — never a hardcoded
 * per-scenario insert — per docs/implementation_plan/phase6.md's
 * data-driven-registry mandate. Adding scenario #21 (or #101) to the
 * catalog seeds it automatically on the next `pnpm db:seed`; this file
 * is never touched. onConflictDoNothing targets the catalog's own
 * partial unique index (slug, scoped to ownershipType="incidentrank"),
 * so re-running the seed is always safe.
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
    await db
      .insert(scenarios)
      .values({
        slug: entry.definition.slug,
        name: entry.definition.name,
        isActive: true,
        ownershipType: "incidentrank",
        visibility: "public",
        status: "published",
      })
      .onConflictDoNothing();
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
