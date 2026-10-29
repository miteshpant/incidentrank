import { Suspense } from "react";
import { AdminDashboard } from "./admin-dashboard";

// Per-user admin authorization + live operational stats — never a
// meaningful static version.
export const instant = false;

export default function AdminPage() {
  return (
    <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <AdminDashboard />
      </Suspense>
    </section>
  );
}
