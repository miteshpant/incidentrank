import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";

async function CustomersIndex() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/admin/customers/users"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Users
        </Link>
        <Link
          href="/admin/customers/organizations"
          className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
        >
          Organizations
        </Link>
      </div>
    </>
  );
}

export const instant = false;

export default function AdminCustomersPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <CustomersIndex />
        </Suspense>
      </section>
    </main>
  );
}
