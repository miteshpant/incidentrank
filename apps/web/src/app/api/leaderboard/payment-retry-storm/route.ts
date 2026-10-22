import { NextResponse } from "next/server";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { getPaymentRetryStormLeaderboard } from "@/lib/server/leaderboard";

export async function GET() {
  const entries = await getPaymentRetryStormLeaderboard();

  return NextResponse.json({
    scenarioSlug: paymentRetryStorm.slug,
    entries: entries.map((entry, index) => ({
      rank: index + 1,
      displayName: entry.displayName,
      score: entry.score,
      recoveryTimeMs: entry.recoveryTimeMs,
    })),
  });
}
