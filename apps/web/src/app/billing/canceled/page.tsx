import Link from "next/link";
import { SiteHeader } from "@/components/site-header";

export default function BillingCanceledPage() {
  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-xl flex-1 px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Checkout canceled</h1>
        <p className="mt-3 text-sm text-muted">
          No charge was made. You can try again anytime from the pricing page.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/pricing"
            className="rounded-md border border-foreground bg-foreground px-4 py-2 font-mono text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Back to Pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
