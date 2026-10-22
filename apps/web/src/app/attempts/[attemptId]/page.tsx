import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AttemptDetail } from "./attempt-detail";

// Always per-user, per-attempt data — never a meaningful static version.
export const instant = false;

interface AttemptDetailPageProps {
  params: Promise<{ attemptId: string }>;
}

export default async function AttemptDetailPage({
  params,
}: AttemptDetailPageProps) {
  const { attemptId } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense
          fallback={<p className="text-sm text-muted">Loading…</p>}
        >
          <AttemptDetail attemptId={attemptId} />
        </Suspense>
      </section>
    </main>
  );
}
