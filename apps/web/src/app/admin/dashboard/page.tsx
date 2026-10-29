import { Suspense } from "react";
import { DashboardView } from "./dashboard-view";
import type { DateRange } from "@/lib/server/platform-metrics";

const VALID_RANGES: DateRange[] = ["today", "7d", "30d", "all"];

export const instant = false;

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range: DateRange = VALID_RANGES.includes(params.range as DateRange)
    ? (params.range as DateRange)
    : "30d";

  return (
    <section className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <DashboardView range={range} />
      </Suspense>
    </section>
  );
}
