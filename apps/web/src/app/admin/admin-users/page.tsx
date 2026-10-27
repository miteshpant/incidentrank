import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AdminUsersView } from "./admin-users-view";

export const instant = false;

export default function AdminUsersPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <AdminUsersView />
        </Suspense>
      </section>
    </main>
  );
}
