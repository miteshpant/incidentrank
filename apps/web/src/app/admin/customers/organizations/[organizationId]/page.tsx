import { Suspense } from "react";
import { OrganizationCustomerDetailView } from "./organization-customer-detail-view";

export const instant = false;

export default async function AdminCustomerOrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <OrganizationCustomerDetailView organizationId={organizationId} />
      </Suspense>
    </section>
  );
}
