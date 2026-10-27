import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { IncidentPassesView } from "./incident-passes-view";

export const instant = false;

export default function IncidentPassesPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <IncidentPassesView />
        </Suspense>
      </section>
    </main>
  );
}
