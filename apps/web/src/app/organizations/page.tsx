import { Suspense } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { OrganizationsList } from "./organizations-list";

// Always per-user data — never a meaningful static version.
export const instant = false;

export default function OrganizationsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
          <Link
            href="/organizations/new"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Create Organization
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          Organizations you belong to as a hiring-team member.
        </p>

        <Suspense fallback={<p className="mt-10 text-sm text-muted">Loading…</p>}>
          <OrganizationsList />
        </Suspense>
      </section>
    </main>
  );
}
