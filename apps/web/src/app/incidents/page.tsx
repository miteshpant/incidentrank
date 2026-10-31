import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, listBuiltInScenarioEntries } from "@incidentrank/scenarios";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getPracticeProgressBySlug } from "@/lib/server/practice-progress";
import { isScenarioCurrentlyPublished } from "@/lib/server/scenario-registry";
import { db } from "@/lib/server/db";
import { LibraryBrowser, type LibraryEntry } from "./library-browser";

// Filters/search/sort live in the URL query string and practice progress
// is per-user — never a meaningful static version.
export const instant = false;

/**
 * The public scenario library (docs/implementation_plan/phase6.md's
 * "Scenario Library Page"). Lists every public, IncidentRank-owned
 * scenario in BUILT_IN_SCENARIO_CATALOG — organization-authored
 * scenarios are never exposed here (see the catalog's own privacy
 * boundary; this page never queries the `scenarios` table for
 * organization-owned rows at all). Adding scenario #21 (or #101) to the
 * catalog surfaces it here automatically.
 */
export async function LibraryContent() {
  const [user, progressBySlug, publicationRows] = await Promise.all([
    getOrCreateCurrentUser(),
    getPracticeProgressBySlug(),
    db.query.scenarios.findMany({
      where: eq(scenarios.ownershipType, "incidentrank"),
      columns: { slug: true, status: true, publishedAt: true },
    }),
  ]);

  // Phase 10G §4: a draft or scheduled-but-not-yet-released scenario must
  // never appear in the public library — a row with no seed yet defaults
  // to visible (matches isBuiltInScenarioCurrentlyPublished's own
  // fallback), since the catalog entry existing at all is the only way
  // to reach this filter.
  const publishedBySlug = new Map(
    publicationRows.map((row) => [row.slug, isScenarioCurrentlyPublished(row)]),
  );

  const entries: LibraryEntry[] = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)
    .filter((entry) => entry.definition.library)
    .filter((entry) => publishedBySlug.get(entry.definition.slug) ?? true)
    .map((entry) => ({
      definition: entry.definition,
      progress: progressBySlug[entry.definition.slug] ?? null,
    }));

  return <LibraryBrowser entries={entries} isSignedIn={Boolean(user)} />;
}

export default function IncidentsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-6xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Practice Incidents
        </h1>
        <p className="mt-2 text-sm text-muted">
          Live, operational scenarios. No multiple choice. No free text.
        </p>

        <Suspense fallback={<p className="mt-10 text-sm text-muted">Loading…</p>}>
          <LibraryContent />
        </Suspense>
      </section>
    </main>
  );
}
