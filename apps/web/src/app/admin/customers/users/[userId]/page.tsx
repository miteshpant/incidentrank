import { Suspense } from "react";
import { UserDetailView } from "./user-detail-view";

export const instant = false;

export default async function AdminCustomerUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  return (
    <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <UserDetailView userId={userId} />
      </Suspense>
    </section>
  );
}
