import { Suspense } from "react";
import { WebhookEventsView } from "./webhook-events-view";

export const instant = false;

export default function WebhookEventsPage() {
  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <WebhookEventsView />
      </Suspense>
    </section>
  );
}
