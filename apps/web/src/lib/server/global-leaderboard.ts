import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { rankSnapshots, users } from "@incidentrank/db";
import { db } from "./db";

export interface GlobalLeaderboardEntry {
  userId: string;
  displayName: string;
  rankBand: string;
  confidence: string;
  normalizedScore: number;
  qualifyingAttempts: number;
  evidenceBreadth: number;
}

const RANK_BAND_ORDINAL: Record<string, number> = {
  developing: 0,
  intermediate: 1,
  senior: 2,
  staff: 3,
  senior_staff: 4,
  principal: 5,
};

/**
 * The single global leaderboard (docs/implementation_plan/phase10c.md
 * §17, extended at the user's explicit request — see the Phase 10C
 * completion report's "Global Leaderboard" section for the scope
 * deviation note). Ranks each opted-in user's LATEST rank_snapshots row
 * — not raw score — band-first, normalizedScore as a within-band
 * tiebreak only, so raw score never crosses a band boundary (spec §2:
 * "do not build a naive global-score leaderboard"). Visibility reuses
 * users.leaderboardVisible exactly as the old single-scenario
 * leaderboard did; this is a DIFFERENT boundary from Engineer Rank's own
 * always-private-to-self-and-admin default (see engineer-rank.ts) —
 * opting in here exposes only the 6 public fields below, never the
 * dimension/skill breakdown or any attempt-level detail.
 */
export async function getGlobalLeaderboard(limit = 100): Promise<GlobalLeaderboardEntry[]> {
  const latestPerUser = db.$with("latest_rank_snapshot").as(
    db
      .select({
        userId: rankSnapshots.userId,
        rankBand: rankSnapshots.rankBand,
        confidence: rankSnapshots.confidence,
        normalizedScore: rankSnapshots.normalizedScore,
        qualifyingAttempts: rankSnapshots.qualifyingAttempts,
        evidenceBreadth: rankSnapshots.evidenceBreadth,
        rowNumber: sql<number>`row_number() over (
          partition by ${rankSnapshots.userId}
          order by ${rankSnapshots.createdAt} desc
        )`.as("row_number"),
      })
      .from(rankSnapshots),
  );

  const rows = await db
    .with(latestPerUser)
    .select({
      userId: latestPerUser.userId,
      displayName: users.displayName,
      rankBand: latestPerUser.rankBand,
      confidence: latestPerUser.confidence,
      normalizedScore: latestPerUser.normalizedScore,
      qualifyingAttempts: latestPerUser.qualifyingAttempts,
      evidenceBreadth: latestPerUser.evidenceBreadth,
    })
    .from(latestPerUser)
    .innerJoin(users, eq(users.id, latestPerUser.userId))
    .where(and(eq(latestPerUser.rowNumber, 1), eq(users.leaderboardVisible, true)))
    .orderBy(desc(latestPerUser.normalizedScore))
    .limit(limit * 4); // overfetch; final band-first ordering is applied in JS below

  return rows
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      rankBand: row.rankBand,
      confidence: row.confidence,
      normalizedScore: row.normalizedScore,
      qualifyingAttempts: row.qualifyingAttempts,
      evidenceBreadth: row.evidenceBreadth,
    }))
    .sort((a, b) => {
      const bandDiff = (RANK_BAND_ORDINAL[b.rankBand] ?? -1) - (RANK_BAND_ORDINAL[a.rankBand] ?? -1);
      if (bandDiff !== 0) return bandDiff;
      return b.normalizedScore - a.normalizedScore;
    })
    .slice(0, limit);
}
