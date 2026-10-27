import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { NewOrganizationForm } from "./new-organization-form";

export const instant = false;

export default async function NewOrganizationAdminPage() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">New Organization</h1>
        <p className="mt-2 text-sm text-muted">
          Creates the organization with status <span className="font-mono text-xs">pending</span> and
          sends the initial owner an invitation. The organization becomes active once that invitation
          is accepted.
        </p>

        <div className="mt-8">
          <NewOrganizationForm />
        </div>
      </section>
    </main>
  );
}
