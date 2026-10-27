import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { attempts, scenarios } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { redactAttemptForCandidate } from "@/lib/server/redact-attempt-for-candidate";
import { formatElapsed, formatNumber } from "@/lib/format";
import { ScenarioMetadata } from "@/components/scenario-console/scenario-metadata";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In Progress",
  resolved: "Resolved",
  failed: "Failed",
  abandoned: "Abandoned",
};

/**
 * This user's attempt history for exactly one scenario, with that
 * scenario's description/difficulty/skills/architecture (the same
 * presentational block the locked-scenario screen shows) above it.
 * Scoped to built-in scenarios only — practice attempts never exist
 * against an organization-owned scenario (see scenario-registry.ts's
 * isPlayableBuiltinScenario), so an unknown/org slug here correctly
 * 404s rather than needing a second metadata source.
 */
export async function ScenarioAttempts({ slug }: { slug: string }) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }

  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
  if (!entry) notFound();

  const scenarioRow = await db.query.scenarios.findFirst({
    where: and(eq(scenarios.slug, slug), eq(scenarios.ownershipType, "incidentrank")),
  });
  if (!scenarioRow) notFound();

  const rows = await db.query.attempts.findMany({
    where: and(eq(attempts.userId, user.id), eq(attempts.scenarioId, scenarioRow.id)),
    orderBy: [desc(attempts.createdAt)],
  });

  if (rows.length === 0) notFound();

  return (
    <>
      <Link href="/attempts" className="font-mono text-xs text-muted hover:text-foreground">
        ← Back to attempts
      </Link>

      <div className="mt-4">
        <ScenarioMetadata scenario={entry.definition} />
      </div>

      <h2 className="mt-10 font-mono text-xs uppercase tracking-wide text-muted">
        Your Attempts
      </h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Score</th>
              <th className="py-2 pr-4">Outcome</th>
              <th className="py-2 pr-4">Recovery</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((attempt) => {
              const safe = redactAttemptForCandidate(attempt);
              return (
                <tr key={attempt.id} className="border-b border-border">
                  <td className="py-3 pr-4">
                    <Link href={`/attempts/${attempt.id}`} className="hover:underline">
                      {attempt.createdAt.toLocaleDateString()}
                    </Link>
                  </td>
                  {safe.attemptType === "assessment" ? (
                    <>
                      <td className="py-3 pr-4 font-mono text-muted">—</td>
                      <td className="py-3 pr-4">
                        {safe.submitted ? "Submitted" : "In Progress"}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs text-muted">—</td>
                    </>
                  ) : (
                    <>
                      <td className="py-3 pr-4 font-mono">
                        {safe.score !== null
                          ? `${formatNumber(safe.score)} / 1000`
                          : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        {STATUS_LABEL[safe.status] ?? safe.status}
                      </td>
                      <td className="py-3 pr-4 font-mono text-xs">
                        {safe.recoveryTimeMs !== null
                          ? formatElapsed(safe.recoveryTimeMs)
                          : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
