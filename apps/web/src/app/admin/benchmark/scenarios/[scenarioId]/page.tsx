import { Suspense } from "react";
import { BenchmarkScenarioDetailView } from "./benchmark-scenario-detail-view";

export const instant = false;

export default async function AdminBenchmarkScenarioDetailPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;

  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <BenchmarkScenarioDetailView scenarioId={scenarioId} />
      </Suspense>
    </section>
  );
}
