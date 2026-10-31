import { Suspense } from "react";
import { ScenarioDetailView } from "./scenario-detail-view";

export const instant = false;

export default async function AdminScenarioDetailPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;

  return (
    <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ScenarioDetailView scenarioId={scenarioId} />
      </Suspense>
    </section>
  );
}
