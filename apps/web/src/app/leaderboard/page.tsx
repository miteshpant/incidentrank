import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getGlobalLeaderboard } from "@/lib/server/global-leaderboard";
import { isEngineerRankEnabled } from "@/lib/server/feature-flags";

const BAND_LABEL: Record<string, string> = {
  developing: "Developing",
  intermediate: "Intermediate",
  senior: "Senior",
  staff: "Staff",
  senior_staff: "Senior Staff",
  principal: "Principal",
};

// Live data — never bake a stale leaderboard snapshot at build time.
export const instant = false;

export default async function LeaderboardPage() {
  if (!isEngineerRankEnabled()) {
    return (
      <main className="flex flex-1 flex-col">
        <SiteHeader />
        <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
          <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
          <p className="mt-4 text-sm text-muted">Not available yet.</p>
        </section>
      </main>
    );
  }

  const entries = await getGlobalLeaderboard();

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mt-2 text-sm text-muted">
          Ranked by IncidentRank level — not raw score. Users control whether they appear here
          from their profile settings.
        </p>

        {entries.length === 0 ? (
          <p className="mt-10 text-sm text-muted">
            No public ranks yet.{" "}
            <Link href="/incidents" className="underline hover:text-foreground">
              Complete an incident to start building your rank.
            </Link>
          </p>
        ) : (
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Rank</th>
                  <th className="py-2 pr-4">Engineer</th>
                  <th className="py-2 pr-4">Level</th>
                  <th className="py-2 pr-4">Incidents Solved</th>
                  <th className="py-2 pr-4">Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={`${entry.displayName}-${index}`} className="border-b border-border">
                    <td className="py-3 pr-4 font-mono text-muted">{index + 1}</td>
                    <td className="py-3 pr-4">{entry.displayName}</td>
                    <td className="py-3 pr-4">{BAND_LABEL[entry.rankBand] ?? entry.rankBand}</td>
                    <td className="py-3 pr-4 font-mono">{entry.qualifyingAttempts}</td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {Math.round(entry.normalizedScore * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
