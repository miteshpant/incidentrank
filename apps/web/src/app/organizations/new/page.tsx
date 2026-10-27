import { SiteHeader } from "@/components/site-header";

/**
 * Phase 10A §3/§33: organization creation is no longer self-service — an
 * IncidentRank platform admin provisions new organizations and assigns
 * their initial owner, who then activates it by accepting an email
 * invitation. This page intentionally renders a static denial message
 * (not a redirect) so a visitor arriving via an old bookmark or link
 * gets an honest explanation rather than a silent bounce. The real
 * enforcement is server-side — POST /api/organizations always rejects —
 * this page is purely informational.
 */
export default function NewOrganizationPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Organization creation is managed by IncidentRank
        </h1>
        <p className="mt-2 text-sm text-muted">
          Organizations are provisioned by IncidentRank and assigned an initial owner, who
          activates it by accepting an email invitation. Contact support@incidentrank.com to
          set up a new organization for your team.
        </p>
      </section>
    </main>
  );
}
