import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, listBuiltInScenarioEntries } from "@incidentrank/scenarios";
import { appBaseUrl } from "@/lib/server/app-url";
import { isScenarioCurrentlyPublished } from "@/lib/server/scenario-registry";
import { db } from "@/lib/server/db";

/**
 * Public sitemap — homepage, the static public pages, and every
 * currently-published, library-listed built-in scenario (docs/
 * implementation_plan/seopphase.md §7). Deliberately excludes every
 * admin/private-assessment/org-internal/candidate-assignment/challenge-
 * token/auth-callback/private-result route — those are never reachable
 * from this file because this only ever enumerates the explicit
 * include-list below, never walks the real route tree.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = appBaseUrl();

  const publicationRows = await db.query.scenarios.findMany({
    where: eq(scenarios.ownershipType, "incidentrank"),
    columns: { slug: true, status: true, publishedAt: true },
  });
  const publishedBySlug = new Map(
    publicationRows.map((row) => [row.slug, isScenarioCurrentlyPublished(row)]),
  );

  const scenarioEntries = listBuiltInScenarioEntries(BUILT_IN_SCENARIO_CATALOG)
    .filter((entry) => entry.definition.library)
    .filter((entry) => publishedBySlug.get(entry.definition.slug) ?? true);

  const scenarioUrls: MetadataRoute.Sitemap = scenarioEntries.map((entry) => ({
    url: `${baseUrl}/incidents/${entry.definition.slug}`,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/incidents`, changeFrequency: "daily", priority: 0.9 },
    // Payment Retry Storm predates BUILT_IN_SCENARIO_CATALOG (Phase 6
    // promotion contract) and so is never in listBuiltInScenarioEntries —
    // included explicitly since it's a real, free, publicly playable
    // scenario with its own page.
    { url: `${baseUrl}/incidents/payment-retry-storm`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/pricing`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/contact`, changeFrequency: "yearly", priority: 0.3 },
    ...scenarioUrls,
  ];
}
