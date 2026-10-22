import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate } from "@/lib/server/organization-auth";
import { loadOrgScenario, listScenarioVersions } from "@/lib/server/scenario-access";
import { ScenarioEditor } from "./scenario-editor";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

export default async function EditScenarioPage({
  params,
}: {
  params: Promise<{ slug: string; scenarioId: string }>;
}) {
  const { slug, scenarioId } = await params;
  const user = await getOrCreateCurrentUser();
  if (!user) notFound(); // middleware protects this route; unreachable in practice.

  const result = await loadOrgScenario(slug, scenarioId, user);
  if (!result.ok) notFound();

  const versions = await listScenarioVersions(scenarioId);
  const draft = versions.find((v) => v.status === "draft") ?? null;
  const latestPublished =
    versions.filter((v) => v.status === "published").sort((a, b) => b.version - a.version)[0] ??
    null;

  const canEdit = canMutate(result.membership.role);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        <ScenarioEditor
          slug={slug}
          scenarioId={scenarioId}
          scenarioName={result.scenario.name}
          draft={draft}
          latestPublished={latestPublished}
          versions={versions}
          canEdit={canEdit}
        />
      </section>
    </main>
  );
}
