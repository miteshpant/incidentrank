import { Suspense } from "react";
import { BUILT_IN_SCENARIO_CATALOG, listBuiltInScenarioEntries } from "@incidentrank/scenarios";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getPracticeProgressBySlug } from "@/lib/server/practice-progress";
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
  const [user, progressBySlug] = await Promise.all([
    getOrCreateCurrentUser(),
    getPracticeProgressBySlug(),
  ]);

  const entries: LibraryEntry[] = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)
    .filter((entry) => entry.definition.library)
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
