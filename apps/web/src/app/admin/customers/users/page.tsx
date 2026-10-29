import { Suspense } from "react";
import { CustomersUsersView } from "./customers-users-view";
import type { CustomerSort } from "@/lib/server/platform-metrics";

const VALID_SORTS: CustomerSort[] = ["newest", "oldest", "highest_spend", "recently_purchased"];

export const instant = false;

export default async function AdminCustomersUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; q?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const sort: CustomerSort = VALID_SORTS.includes(params.sort as CustomerSort)
    ? (params.sort as CustomerSort)
    : "newest";
  const plan =
    params.plan === "free" || params.plan === "pro" || params.plan === "founding" ? params.plan : undefined;

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <CustomersUsersView page={page} sort={sort} q={params.q} plan={plan} />
      </Suspense>
    </section>
  );
}
