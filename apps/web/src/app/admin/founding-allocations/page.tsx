import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { FoundingAllocationsView } from "./founding-allocations-view";

export const instant = false;

export default function FoundingAllocationsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <FoundingAllocationsView />
        </Suspense>
      </section>
    </main>
  );
}
