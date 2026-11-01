import { SiteHeader } from "@/components/site-header";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled, isPaymentsEnabled } from "@/lib/server/feature-flags";
import { AdminNav } from "./admin-nav";

/**
 * Shared chrome for every /admin/* page: header + persistent section nav.
 * Every admin page/view still keeps its own inline loadAdminMembership()
 * gate for its actual data (see admin-dashboard.tsx) — that part is
 * unchanged and remains the authoritative check.
 *
 * This layout additionally decides whether to render the nav itself. The
 * nav lists every admin section by name (Stripe Subscriptions, Webhook
 * Events, Founding Allocations, ...) and previously rendered
 * unconditionally for any visitor, signed in or not, before any
 * per-page gate ran — leaking the admin surface's structure to the
 * public even though no actual data was ever exposed (each page's own
 * gate still correctly blocked that). This check is deliberately
 * presence-only (never notFound()/redirect here): /admin/invite/[token]
 * must keep rendering its children for a signed-out invite recipient,
 * same as before — only the nav disappears for a non-admin, mirroring
 * AdminNav's own existing /admin/invite/ exception.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await isCurrentUserAdmin();

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />
      {isAdmin && <AdminNav paymentsEnabled={isPaymentsEnabled()} />}
      {children}
    </main>
  );
}

async function isCurrentUserAdmin(): Promise<boolean> {
  if (!isAdminPortalEnabled()) return false;
  const user = await getOrCreateCurrentUser();
  if (!user) return false;
  const membership = await loadAdminMembership(user);
  return membership.ok;
}
