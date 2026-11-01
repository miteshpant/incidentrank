import { Suspense } from "react";
import { AnalyticsView } from "./analytics-view";
import type { AnalyticsRange } from "@/lib/server/analytics";

const VALID_RANGES: AnalyticsRange[] = ["7d", "30d", "all"];

export const instant = false;

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range: AnalyticsRange = VALID_RANGES.includes(params.range as AnalyticsRange)
    ? (params.range as AnalyticsRange)
    : "30d";

  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <AnalyticsView range={range} />
      </Suspense>
    </section>
  );
}
