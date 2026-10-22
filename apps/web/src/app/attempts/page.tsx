import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { AttemptsList } from "./attempts-list";

// Always per-user data — never a meaningful static version.
export const instant = false;

export default function AttemptsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Your Attempts
        </h1>
        <p className="mt-2 text-sm text-muted">
          Newest first. Every attempt is immutable once recorded.
        </p>

        <Suspense
          fallback={<p className="mt-10 text-sm text-muted">Loading…</p>}
        >
          <AttemptsList />
        </Suspense>
      </section>
    </main>
  );
}
