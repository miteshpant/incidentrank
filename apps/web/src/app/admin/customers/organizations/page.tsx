import { Suspense } from "react";
import { CustomersOrganizationsView } from "./customers-organizations-view";
import type { CustomerSort } from "@/lib/server/platform-metrics";

const VALID_SORTS: CustomerSort[] = ["newest", "oldest", "highest_spend", "recently_purchased"];

export const instant = false;

export default async function AdminCustomersOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort: CustomerSort = VALID_SORTS.includes(params.sort as CustomerSort)
    ? (params.sort as CustomerSort)
    : "newest";

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <CustomersOrganizationsView
          page={page}
          sort={sort}
          q={params.q}
          suspendedOnly={params.status === "suspended"}
        />
      </Suspense>
    </section>
  );
}
