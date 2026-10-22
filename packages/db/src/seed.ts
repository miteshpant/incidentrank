import { BUILT_IN_SCENARIO_CATALOG, listBuiltInScenarioEntries } from "@incidentrank/scenarios";
import { createDb } from "./client";
import { scenarios } from "./schema";

/**
 * Seeds every scenario in BUILT_IN_SCENARIO_CATALOG — never a hardcoded
 * per-scenario insert — per docs/implementation_plan/phase6.md's
 * data-driven-registry mandate. Adding scenario #21 (or #101) to the
 * catalog seeds it automatically on the next `pnpm db:seed`; this file
 * is never touched. onConflictDoNothing targets the catalog's own
 * partial unique index (slug, scoped to ownershipType="incidentrank"),
 * so re-running the seed is always safe.
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

  console.log(`Seed complete (${entries.length} built-in scenario(s)).`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
