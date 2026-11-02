import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { PricingContent } from "./pricing-content";

// Per-request: entitlement state and Founding capacity both change live.
export const instant = false;

export const metadata: Metadata = {
  title: "Pricing | IncidentRank",
  description:
    "Unlock every premium production incident in the IncidentRank catalog — Pro and Founding plans for ongoing system design and incident-response practice.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageViewTracker />
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-2 text-sm text-muted">
          Unlock every premium incident in the catalog.
        </p>

        <Suspense fallback={<p className="mt-10 text-sm text-muted">Loading…</p>}>
          <PricingContent />
        </Suspense>

        <p className="mt-12 border-t border-border pt-6 text-sm text-muted">
          Questions about using IncidentRank for hiring?{" "}
          <Link href="/contact" className="underline hover:text-foreground">
            Contact us
          </Link>
        </p>
      </section>
    </main>
  );
}
