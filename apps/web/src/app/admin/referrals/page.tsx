import { Suspense } from "react";
import { ReferralsView } from "./referrals-view";

export const instant = false;

export default function ReferralsPage() {
  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ReferralsView />
      </Suspense>
    </section>
  );
}
