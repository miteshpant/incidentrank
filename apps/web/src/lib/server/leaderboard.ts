import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { attempts, scenarios, users } from "@incidentrank/db";
import { paymentRetryStorm } from "@incidentrank/scenarios";
import { db } from "./db";

export interface LeaderboardEntry {
  displayName: string;
  score: number | null;
  recoveryTimeMs: number | null;
}

/**
 * Each visible user's single best completed (resolved) practice attempt.
 * Tie-break order: higher score, lower recovery time, lower revenue loss,
 * earlier completion timestamp. See docs/architecture.md for the full rule.
 * Exposes only displayName/score/recoveryTimeMs — never reasoning, event
 * timelines, email, or auth provider identifiers.
 */
export async function getPaymentRetryStormLeaderboard(): Promise<
  LeaderboardEntry[]
> {
  const ranked = db.$with("ranked").as(
    db
      .select({
        userId: attempts.userId,
        score: attempts.score,
        recoveryTimeMs: attempts.recoveryTimeMs,
        revenueLossUsd: attempts.revenueLossUsd,
        completedAt: attempts.completedAt,
        rowNumber: sql<number>`row_number() over (
          partition by ${attempts.userId}
          order by
            ${attempts.score} desc,
            ${attempts.recoveryTimeMs} asc nulls last,
            ${attempts.revenueLossUsd} asc nulls last,
            ${attempts.completedAt} asc
        )`.as("row_number"),
      })
      .from(attempts)
      .innerJoin(scenarios, eq(attempts.scenarioId, scenarios.id))
      .where(
        and(
          eq(scenarios.slug, paymentRetryStorm.slug),
          eq(attempts.attemptType, "practice"),
          eq(attempts.status, "completed"),
          eq(attempts.outcome, "resolved"),
          isNotNull(attempts.score),
          isNotNull(attempts.completedAt),
        ),
      ),
  );

  return db
    .with(ranked)
    .select({
      displayName: users.displayName,
      score: ranked.score,
      recoveryTimeMs: ranked.recoveryTimeMs,
    })
    .from(ranked)
    .innerJoin(users, eq(users.id, ranked.userId))
    .where(and(eq(ranked.rowNumber, 1), eq(users.leaderboardVisible, true)))
    .orderBy(
      desc(ranked.score),
      sql`${ranked.recoveryTimeMs} asc nulls last`,
      sql`${ranked.revenueLossUsd} asc nulls last`,
      ranked.completedAt,
    )
    .limit(100);
}
