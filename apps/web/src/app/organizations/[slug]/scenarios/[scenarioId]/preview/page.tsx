import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrgScenario, getDraftVersion, getLatestPublishedVersion } from "@/lib/server/scenario-access";
import { compileAuthoredScenario, authoredScenarioToCandidateUI, type AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { PreviewConsole } from "./preview-console";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

export default async function PreviewScenarioPage({
  params,
}: {
  params: Promise<{ slug: string; scenarioId: string }>;
}) {
  const { slug, scenarioId } = await params;
  const user = await getOrCreateCurrentUser();
  if (!user) notFound(); // middleware protects this route; unreachable in practice.

  const result = await loadOrgScenario(slug, scenarioId, user);
  if (!result.ok) notFound();

  // Preview the draft if one exists, otherwise fall back to the latest
  // published version — an author should be able to preview either.
  const draft = await getDraftVersion(scenarioId);
  const versionRow = draft ?? (await getLatestPublishedVersion(scenarioId));
  if (!versionRow) notFound();

  const authored = versionRow.definitionJson as AuthoredScenario;
  const compiled = compileAuthoredScenario(authored);

  if (!compiled.ok) {
    return (
      <main className="flex flex-1 flex-col">
        <SiteHeader />
        <section className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Preview unavailable</h1>
          <p className="mt-4 text-sm text-muted">
            This draft has validation errors and cannot be compiled for preview. Fix the
            errors listed in the editor before previewing.
          </p>
        </section>
      </main>
    );
  }

  const candidateUI = authoredScenarioToCandidateUI(authored);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <PreviewConsole
        scenarioSlug={compiled.definition.slug}
        scenarioName={compiled.definition.name}
        simulation={compiled.definition.simulation}
        candidateUI={candidateUI}
        authoredScoring={authored.scoring}
      />
    </main>
  );
}
