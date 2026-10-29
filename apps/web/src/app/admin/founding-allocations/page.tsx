import { Suspense } from "react";
import { FoundingAllocationsView } from "./founding-allocations-view";

export const instant = false;

export default function FoundingAllocationsPage() {
  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <FoundingAllocationsView />
      </Suspense>
    </section>
  );
}
