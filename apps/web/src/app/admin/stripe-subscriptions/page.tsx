import { Suspense } from "react";
import { StripeSubscriptionsView } from "./stripe-subscriptions-view";

export const instant = false;

export default function StripeSubscriptionsPage() {
  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <StripeSubscriptionsView />
      </Suspense>
    </section>
  );
}
