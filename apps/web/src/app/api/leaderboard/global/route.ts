import { NextResponse } from "next/server";
import { getGlobalLeaderboard } from "@/lib/server/global-leaderboard";
import { isEngineerRankEnabled } from "@/lib/server/feature-flags";

export async function GET() {
  if (!isEngineerRankEnabled()) {
    return NextResponse.json({ entries: [] });
  }

  const entries = await getGlobalLeaderboard();

  return NextResponse.json({
    entries: entries.map((entry, index) => ({
      rank: index + 1,
      displayName: entry.displayName,
      rankBand: entry.rankBand,
      confidence: entry.confidence,
      normalizedScore: entry.normalizedScore,
      qualifyingAttempts: entry.qualifyingAttempts,
      evidenceBreadth: entry.evidenceBreadth,
    })),
  });
}
