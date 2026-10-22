import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { CandidateResult } from "./candidate-result";

// Always per-user, per-organization data — never a meaningful static version.
export const instant = false;

export default async function CandidateResultPage({
  params,
}: {
  params: Promise<{ slug: string; assessmentId: string; candidateId: string }>;
}) {
  const { slug, assessmentId, candidateId } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <CandidateResult
            slug={slug}
            assessmentId={assessmentId}
            candidateId={candidateId}
          />
        </Suspense>
      </section>
    </main>
  );
}
