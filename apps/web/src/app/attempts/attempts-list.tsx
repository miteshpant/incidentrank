import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { formatElapsed, formatNumber } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In Progress",
  resolved: "Resolved",
  failed: "Failed",
  abandoned: "Abandoned",
};

export async function AttemptsList() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return null; // middleware protects this route; unreachable in practice.
  }

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

  return (
    <div className="mt-10 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
            <th className="py-2 pr-4">Scenario</th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Score</th>
            <th className="py-2 pr-4">Outcome</th>
            <th className="py-2 pr-4">Recovery</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((attempt) => (
            <tr key={attempt.id} className="border-b border-border">
              <td className="py-3 pr-4">
                <Link href={`/attempts/${attempt.id}`} className="hover:underline">
                  {attempt.scenario.name}
                </Link>
              </td>
              <td className="py-3 pr-4 font-mono text-xs text-muted">
                {attempt.createdAt.toLocaleDateString()}
              </td>
              <td className="py-3 pr-4 font-mono">
                {attempt.score !== null
                  ? `${formatNumber(attempt.score)} / 1000`
                  : "—"}
              </td>
              <td className="py-3 pr-4">
                {STATUS_LABEL[attempt.status] ?? attempt.status}
              </td>
              <td className="py-3 pr-4 font-mono text-xs">
                {attempt.recoveryTimeMs !== null
                  ? formatElapsed(attempt.recoveryTimeMs)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
