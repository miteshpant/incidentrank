import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { attempts, type Attempt, type Scenario } from "@incidentrank/db";
import { db } from "./db";
import { getOrCreateCurrentUser } from "./current-user";
import { isIncidentResolved } from "../attempt-lifecycle";

export interface ScenarioPracticeProgress {
  attemptCount: number;
  bestScore: number | null;
  completed: boolean;
}

/** Keyed by scenario slug — the stable, catalog-native join key every built-in scenario is already identified by (see scenario-registry.ts). */
export type PracticeProgressBySlug = Record<string, ScenarioPracticeProgress>;

/**
 * Per-scenario practice progress for the signed-in user, keyed by slug —
 * for the public library page's "Not attempted" / "Best: N / M attempts"
 * cards (docs/implementation_plan/phase6.md's "Practice Progress"). Scoped
 * to attemptType="practice" only — assessment attempts must never affect
 * practice progress or its filters. Returns an empty object for a
 * signed-out visitor (no account exists to have progress), never throws,
 * never creates an account merely from browsing the library.
 */
export async function getPracticeProgressBySlug(): Promise<PracticeProgressBySlug> {
  const user = await getOrCreateCurrentUser();
  if (!user) return {};

  const rows = await db.query.attempts.findMany({
    where: and(eq(attempts.userId, user.id), eq(attempts.attemptType, "practice")),
    orderBy: [desc(attempts.createdAt)],
    with: { scenario: true },
  });

  const bySlug: Record<string, (Attempt & { scenario: Scenario })[]> = {};
  for (const row of rows) {
    (bySlug[row.scenario.slug] ??= []).push(row);
  }

  const progress: PracticeProgressBySlug = {};
  for (const [slug, scenarioAttempts] of Object.entries(bySlug)) {
    const scored = scenarioAttempts.filter((a) => a.score !== null);
    const bestScore = scored.length > 0 ? Math.max(...scored.map((a) => a.score!)) : null;
    progress[slug] = {
      attemptCount: scenarioAttempts.length,
      bestScore,
      completed: scenarioAttempts.some(isIncidentResolved),
    };
  }
  return progress;
}
