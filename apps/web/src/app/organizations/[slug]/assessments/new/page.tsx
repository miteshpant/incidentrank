import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership, canMutate } from "@/lib/server/organization-auth";
import { listAssessableScenarios } from "@/lib/server/scenario-registry";
import { NewAssessmentForm } from "./new-assessment-form";

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

  const scenarios = await listAssessableScenarios(membership.organization.id);

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
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
