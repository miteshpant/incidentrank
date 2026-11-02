import { Suspense } from "react";
import { WeeklyChallengeView } from "./weekly-challenge-view";

export const instant = false;

export default function AdminWeeklyChallengePage() {
  return (
    <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <WeeklyChallengeView />
      </Suspense>
    </section>
  );
}
