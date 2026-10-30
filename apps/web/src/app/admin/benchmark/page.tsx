import { Suspense } from "react";
import { BenchmarkOverviewView } from "./benchmark-overview-view";

export const instant = false;

export default function AdminBenchmarkPage() {
  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <BenchmarkOverviewView />
      </Suspense>
    </section>
  );
}
