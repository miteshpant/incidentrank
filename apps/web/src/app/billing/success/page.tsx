import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

/**
 * Post-checkout landing page (docs/implementation_plan/phase9.md §17).
 * Purely informational — the webhook, not this page, is what actually
 * grants entitlement state, since Checkout Session redirect and webhook
 * delivery are not guaranteed to happen in that order.
 */
export default function BillingSuccessPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Payment received</h1>
        <p className="mt-3 text-sm text-muted">
          We&apos;re confirming your access now — this usually takes just a few seconds. Visit
          your profile to see your updated access, or head straight to an incident.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/profile"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Go to Profile
          </Link>
          <Link
            href="/incidents"
            className="rounded-md border border-border px-4 py-2 font-mono text-sm transition-colors hover:border-foreground/40"
          >
            Browse Incidents
          </Link>
        </div>
      </section>
    </main>
  );
}
