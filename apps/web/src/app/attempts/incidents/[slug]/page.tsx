import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { ScenarioAttempts } from "./scenario-attempts";

// Always per-user data — never a meaningful static version.
export const instant = false;

interface ScenarioAttemptsPageProps {
  params: Promise<{ slug: string }>;
}

export default async function ScenarioAttemptsPage({
  params,
}: ScenarioAttemptsPageProps) {
  const { slug } = await params;

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <ScenarioAttempts slug={slug} />
        </Suspense>
      </section>
    </main>
  );
}
