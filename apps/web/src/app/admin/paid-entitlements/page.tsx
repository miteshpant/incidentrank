import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { PaidEntitlementsView } from "./paid-entitlements-view";

export const instant = false;

export default function PaidEntitlementsPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <PaidEntitlementsView />
        </Suspense>
      </section>
    </main>
  );
}
