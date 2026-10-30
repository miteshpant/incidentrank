import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership, canMutate } from "@/lib/server/organization-auth";
import { listAssessableScenarios } from "@/lib/server/scenario-registry";
import { getDraftVersion, getLatestPublishedVersion } from "@/lib/server/scenario-access";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { NewAssessmentForm, type AssessableScenarioOption } from "./new-assessment-form";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

export default async function NewAssessmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getOrCreateCurrentUser();
  if (!user) notFound(); // middleware protects this route; unreachable in practice.

  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok || !canMutate(membership.membership.role)) notFound();

  const rawScenarios = await listAssessableScenarios(membership.organization.id);

  // Enriches the bare DB rows with description/difficulty/category so the
  // picker below can show real scenario info instead of name alone — the
  // admin should never be choosing blind. Built-in: read directly from
  // the catalog (already compiled, no DB round-trip). Organization-owned:
  // read from the same published/draft version row the assessment-
  // creation flow already resolves scenarios against elsewhere.
  const scenarios: AssessableScenarioOption[] = (
    await Promise.all(
      rawScenarios.map(async (row): Promise<AssessableScenarioOption | null> => {
        if (row.ownershipType === "incidentrank") {
          const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, row.slug);
          if (!entry) return null;
          return {
            id: row.id,
            name: entry.definition.name,
            description: entry.definition.description,
            difficulty: entry.definition.difficulty,
            category: entry.definition.library?.category ?? null,
            estimatedMinutes: entry.definition.estimatedMinutes,
          };
        }

        const draft = await getDraftVersion(row.id);
        const versionRow = draft ?? (await getLatestPublishedVersion(row.id));
        if (!versionRow) return null;
        const authored = versionRow.definitionJson as AuthoredScenario;
        return {
          id: row.id,
          name: authored.basics.name,
          description: authored.basics.description,
          difficulty: authored.basics.difficulty,
          category: null,
          estimatedMinutes: authored.basics.estimatedMinutes,
        };
      }),
    )
  ).filter((s): s is AssessableScenarioOption => s !== null);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create Assessment
        </h1>
        <p className="mt-2 text-sm text-muted">
          For {membership.organization.name}.
        </p>

        {scenarios.length === 0 ? (
          <p className="mt-10 text-sm text-muted">
            No scenarios are currently available for assessments.
          </p>
        ) : (
          <NewAssessmentForm slug={slug} scenarios={scenarios} />
        )}
      </section>
    </main>
  );
}
