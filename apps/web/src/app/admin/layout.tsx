import { SiteHeader } from "@/components/site-header";
import { isPaymentsEnabled } from "@/lib/server/feature-flags";
import { AdminNav } from "./admin-nav";

/**
 * Shared chrome for every /admin/* page: header + persistent section nav.
 * Does NOT perform any auth check itself — every admin page/view keeps its
 * own inline loadAdminMembership() gate (see admin-dashboard.tsx), this
 * layout only adds consistent navigation so admins aren't stuck relying on
 * the browser back button between sections.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      <AdminNav paymentsEnabled={isPaymentsEnabled()} />
      {children}
    </main>
  );
}
