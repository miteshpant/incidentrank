import { Suspense } from "react";
import { BenchmarkScenariosView } from "./benchmark-scenarios-view";

export const instant = false;

export default function AdminBenchmarkScenariosPage() {
  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <BenchmarkScenariosView />
      </Suspense>
    </section>
  );
}
