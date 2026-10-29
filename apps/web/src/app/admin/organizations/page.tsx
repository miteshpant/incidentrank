import { Suspense } from "react";
import { OrganizationsView } from "./organizations-view";

export const instant = false;

export default function AdminOrganizationsPage() {
  return (
    <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OrganizationsView />
      </Suspense>
    </section>
  );
}
