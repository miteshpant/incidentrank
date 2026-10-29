import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { enforceLegalGate } from "@/lib/server/legal-gate";
import { redactAttemptForCandidate } from "@/lib/server/redact-attempt-for-candidate";
import { formatNumber } from "@/lib/format";

interface ScenarioGroup {
  slug: string;
  name: string;
  attemptCount: number;
  latestAttemptAt: Date;
  /** Highest practice score across this scenario's attempts, or null if
   * every attempt is either assessment-type (score withheld from the
   * candidate, see redactAttemptForCandidate) or has no score yet. */
  bestScore: number | null;
}

/**
 * Attempts are grouped by scenario (not shown as one flat row per
 * attempt) so a candidate can see every incident they've tried, then
 * drill into /attempts/incidents/[slug] for that scenario's description
 * and the full list of their attempts against it specifically.
 */
export async function AttemptsList() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }
  await enforceLegalGate(user);

  const rows = await db.query.attempts.findMany({
    where: eq(attempts.userId, user.id),
    orderBy: [desc(attempts.createdAt)],
    with: { scenario: true },
  });

  if (rows.length === 0) {
    return (
      <p className="mt-10 text-sm text-muted">
        No attempts yet.{" "}
        <Link href="/incidents" className="underline hover:text-foreground">
          Start an incident
        </Link>
        .
      </p>
    );
  }

  const groupsBySlug = new Map<string, ScenarioGroup>();
  for (const attempt of rows) {
    const safe = redactAttemptForCandidate(attempt);
    const score = safe.attemptType === "practice" ? safe.score : null;

    const existing = groupsBySlug.get(attempt.scenario.slug);
    if (existing) {
      existing.attemptCount += 1;
      if (attempt.createdAt > existing.latestAttemptAt) {
        existing.latestAttemptAt = attempt.createdAt;
      }
      if (score !== null && (existing.bestScore === null || score > existing.bestScore)) {
        existing.bestScore = score;
      }
    } else {
      groupsBySlug.set(attempt.scenario.slug, {
        slug: attempt.scenario.slug,
        name: attempt.scenario.name,
        attemptCount: 1,
        latestAttemptAt: attempt.createdAt,
        bestScore: score,
      });
    }
  }

  // rows is already newest-first, and the first attempt seen per slug
  // sets latestAttemptAt, so groupsBySlug's insertion order already
  // reflects most-recently-attempted-scenario-first.
  const groups = Array.from(groupsBySlug.values());

  return (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-4">Scenario</th>
            <th className="py-2 pr-4">Attempts</th>
            <th className="py-2 pr-4">Best Score</th>
            <th className="py-2 pr-4">Last Attempted</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.slug} className="border-b border-border">
              <td className="py-3 pr-4">
                <Link
                  href={`/attempts/incidents/${group.slug}`}
                  className="hover:underline"
                >
                  {group.name}
                </Link>
              </td>
              <td className="py-3 pr-4 font-mono">{group.attemptCount}</td>
              <td className="py-3 pr-4 font-mono">
                {group.bestScore !== null
                  ? `${formatNumber(group.bestScore)} / 1000`
                  : "—"}
              </td>
              <td className="py-3 pr-4 font-mono text-xs text-muted">
                {group.latestAttemptAt.toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
