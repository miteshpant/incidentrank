import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AssessmentDetail } from "./assessment-detail";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ slug: string; assessmentId: string }>;
}) {
  const { slug, assessmentId } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <AssessmentDetail slug={slug} assessmentId={assessmentId} />
        </Suspense>
      </section>
    </main>
  );
}
