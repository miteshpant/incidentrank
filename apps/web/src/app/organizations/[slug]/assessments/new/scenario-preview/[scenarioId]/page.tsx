import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership, canMutate } from "@/lib/server/organization-auth";
import { getActiveScenarioById } from "@/lib/server/scenario-registry";
import { getDraftVersion, getLatestPublishedVersion } from "@/lib/server/scenario-access";
import {
  compileAuthoredScenario,
  authoredScenarioToCandidateUI,
  type AuthoredScenario,
} from "@incidentrank/scenarios/authoring";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { ScenarioPreviewConsole } from "@/components/scenario-console/scenario-preview-console";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

/**
 * Lets an organization owner/admin preview the exact candidate-facing
 * screen for a scenario before choosing it for an assessment — no
 * scoring/debug panel (unlike the scenario-authoring preview at
 * organizations/[slug]/scenarios/[scenarioId]/preview, which is author-
 * only and exposes matched-rule/score internals never appropriate for a
 * hiring decision). Reuses getActiveScenarioById's existing eligibility
 * union (built-in OR this org's own published scenario) — the same
 * privacy boundary the assessment-creation picker itself is built on, so
 * a different organization's private scenario can never be previewed
 * here, structurally.
 */
export default async function AssessmentScenarioPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; scenarioId: string }>;
}) {
  const { slug, scenarioId } = await params;
  const user = await getOrCreateCurrentUser();
  if (!user) notFound(); // middleware protects this route; unreachable in practice.

  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok || !canMutate(membership.membership.role)) notFound();

  const scenario = await getActiveScenarioById(scenarioId, membership.organization.id);
  if (!scenario) notFound();

  if (scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
    if (!entry) notFound();

    return (
      <main className="flex flex-1 flex-col">
        <SiteHeader />
        <ScenarioPreviewConsole
          scenarioSlug={entry.definition.slug}
          scenarioName={entry.definition.name}
          simulation={entry.definition.simulation}
          candidateUI={entry.candidateUI}
          bannerLabel="Assessment Preview — this is what the candidate will see. Not scored, not persisted."
        />
      </main>
    );
  }

  const draft = await getDraftVersion(scenarioId);
  const versionRow = draft ?? (await getLatestPublishedVersion(scenarioId));
  if (!versionRow) notFound();

  const authored = versionRow.definitionJson as AuthoredScenario;
  const compiled = compileAuthoredScenario(authored);
  if (!compiled.ok) notFound();

  const candidateUI = authoredScenarioToCandidateUI(authored);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <ScenarioPreviewConsole
        scenarioSlug={compiled.definition.slug}
        scenarioName={compiled.definition.name}
        simulation={compiled.definition.simulation}
        candidateUI={candidateUI}
        bannerLabel="Assessment Preview — this is what the candidate will see. Not scored, not persisted."
      />
    </main>
  );
}
