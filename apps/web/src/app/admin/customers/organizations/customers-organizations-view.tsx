import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { listOrganizationCustomers, type CustomerSort } from "@/lib/server/platform-metrics";

const PAGE_SIZE = 50;

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface CustomersOrganizationsViewProps {
  page: number;
  sort: CustomerSort;
  q?: string;
  suspendedOnly?: boolean;
}

/**
 * Platform admin organization-customer list (docs/implementation_plan/
 * phase10c.md §29/§32/§48/§49). `q` is used directly as a slug/name
 * ILIKE filter and, if it looks like a Stripe customer id (cus_
 * prefix), as a direct Stripe customer lookup — both server-authorized
 * behind the admin gate already passed above.
 */
export async function CustomersOrganizationsView({ page, sort, q, suspendedOnly }: CustomersOrganizationsViewProps) {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const isStripeId = q?.startsWith("cus_") ?? false;

  const { rows, total } = await listOrganizationCustomers({
    page,
    pageSize: PAGE_SIZE,
    sort,
    filters: suspendedOnly ? { status: "suspended" } : undefined,
    searchSlugOrName: q && !isStripeId ? q : undefined,
    searchStripeCustomerId: q && isStripeId ? q : undefined,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Organization Customers</h1>
        <Link href="/admin/customers" className="font-mono text-xs text-muted hover:text-foreground">
          ← Customers
        </Link>
      </div>

      <form method="get" className="mt-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search by name, slug, or Stripe customer id…"
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
              <th className="py-2 pr-4">Organization</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Owners</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Credits P/C/A</th>
              <th className="py-2 pr-4">Total Purchased</th>
              <th className="py-2 pr-4">Last Purchase</th>
              <th className="py-2 pr-4">Stripe Customer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.organizationId} className="border-b border-border">
                <td className="py-3 pr-4">
                  <Link
                    href={`/admin/customers/organizations/${row.organizationId}`}
                    className="underline hover:text-foreground"
                  >
                    {row.name}
                  </Link>
                  <p className="font-mono text-[10px] text-muted">{row.slug}</p>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={row.status} />
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">
                  {row.ownerDisplayNames.length > 0 ? row.ownerDisplayNames.join(", ") : "—"}
                </td>
                <td className="py-3 pr-4 font-mono text-xs text-muted">{row.createdAt.toLocaleDateString()}</td>
                <td className="py-3 pr-4 font-mono text-xs">
                  {row.creditsPurchased} / {row.creditsConsumed} / {row.creditsAvailable}
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
                  No organizations found.
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
              href={`/admin/customers/organizations?page=${page - 1}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className="underline hover:text-foreground"
            >
              Previous
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/customers/organizations?page=${page + 1}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "suspended" ? "text-[#dc2626]" : status === "pending" ? "text-amber-500" : "text-muted";
  return <span className={`font-mono text-[10px] uppercase tracking-wide ${color}`}>{status}</span>;
}
