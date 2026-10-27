import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AdminDashboard } from "./admin-dashboard";

// Per-user admin authorization + live operational stats — never a
// meaningful static version.
export const instant = false;

export default function AdminPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <AdminDashboard />
        </Suspense>
      </section>
    </main>
  );
}
