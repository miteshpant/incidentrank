import { Suspense } from "react";
import { ScenariosView } from "./scenarios-view";

export const instant = false;

export default function AdminScenariosPage() {
  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ScenariosView />
      </Suspense>
    </section>
  );
}
