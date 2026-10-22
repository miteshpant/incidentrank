import { SiteHeader } from "@/components/site-header";
import { NewOrganizationForm } from "./new-organization-form";

export default function NewOrganizationPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create Organization
        </h1>
        <p className="mt-2 text-sm text-muted">
          You&apos;ll become the organization&apos;s owner.
        </p>

        <NewOrganizationForm />
      </section>
    </main>
  );
}
