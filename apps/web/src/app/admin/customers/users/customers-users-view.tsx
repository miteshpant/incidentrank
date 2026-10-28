import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { listUserCustomers, type CustomerSort } from "@/lib/server/platform-metrics";
import { findAuthProviderIdsByEmail, resolveEmailsForUsers } from "@/lib/server/customer-identity";

const PAGE_SIZE = 50;

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface CustomersUsersViewProps {
  page: number;
  sort: CustomerSort;
  q?: string;
  plan?: "free" | "pro" | "founding";
}

/**
 * Platform admin user-customer list (docs/implementation_plan/
 * phase10c.md §27/§31/§32/§48/§49). Server-authorized search: `q` is
 * resolved to Clerk authProviderIds BEFORE the list query runs — never
 * exposed as a public/unauthenticated lookup (spec §31).
 */
export async function CustomersUsersView({ page, sort, q, plan }: CustomersUsersViewProps) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const searchAuthProviderIds = q && q.includes("@") ? await findAuthProviderIdsByEmail(q) : undefined;

  const { rows, total } = await listUserCustomers({
    page,
    pageSize: PAGE_SIZE,
    sort,
    filters: plan ? { plan } : undefined,
    searchAuthProviderIds,
  });

  const emails = await resolveEmailsForUsers(rows.map((r) => r.authProviderId));

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">User Customers</h1>
        <Link href="/admin/customers" className="font-mono text-xs text-muted hover:text-foreground">
          ← Customers
        </Link>
      </div>

      <form method="get" className="mt-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by email…"
          className="flex-1 rounded-md border border-border bg-transparent px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-border px-4 py-2 font-mono text-xs transition-colors hover:border-foreground/40"
        >
          Search
        </button>
      </form>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Access</th>
              <th className="py-2 pr-4">Subscription</th>
              <th className="py-2 pr-4">Total Purchased</th>
              <th className="py-2 pr-4">Last Purchase</th>
              <th className="py-2 pr-4">Stripe Customer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-border">
                <td className="py-3 pr-4">
                  <Link href={`/admin/customers/users/${row.userId}`} className="underline hover:text-foreground">
                    {row.displayName}
                  </Link>
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">{emails.get(row.authProviderId) ?? "—"}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">{row.createdAt.toLocaleDateString()}</td>
                <td className="py-3 pr-4">
                  <AccessBadge access={row.currentAccess} />
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {row.subscriptionPlan ? `${row.subscriptionPlan} (${row.subscriptionStatus})` : "—"}
                </td>
                <td className="py-3 pr-4 font-mono">{usd(row.totalPurchasedUsdCents)}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {row.lastPurchaseAt ? row.lastPurchaseAt.toLocaleDateString() : "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {row.stripeCustomerId ? `${row.stripeCustomerId.slice(0, 12)}…` : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-muted">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between font-mono text-xs text-muted">
        <span>
          Page {page} of {totalPages} · {total} total
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/customers/users?page=${page - 1}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="underline hover:text-foreground"
            >
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/customers/users?page=${page + 1}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="underline hover:text-foreground"
            >
              Next
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

function AccessBadge({ access }: { access: "free" | "pro" | "founding" }) {
  const color = access === "founding" ? "text-amber-500" : access === "pro" ? "text-accent" : "text-muted";
  return <span className={`font-mono text-[10px] uppercase tracking-wide ${color}`}>{access}</span>;
}
