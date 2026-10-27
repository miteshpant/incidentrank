import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { PricingContent } from "./pricing-content";

// Per-request: entitlement state and Founding capacity both change live.
export const instant = false;

export default function PricingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-sm text-muted">
          Unlock every premium incident in the catalog.
        </p>

        <Suspense fallback={<p className="mt-10 text-sm text-muted">Loading…</p>}>
          <PricingContent />
        </Suspense>
      </section>
    </main>
  );
}
