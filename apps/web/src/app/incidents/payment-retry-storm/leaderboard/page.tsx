import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { getPaymentRetryStormLeaderboard } from "@/lib/server/leaderboard";
import { formatElapsed, formatNumber } from "@/lib/format";

// Live data — never bake a stale leaderboard snapshot at build time.
export const instant = false;

export default async function PaymentRetryStormLeaderboardPage() {
  const entries = await getPaymentRetryStormLeaderboard();

  return (
    <main className="flex flex-1 flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Link
          href="/incidents"
          className="font-mono text-xs text-muted hover:text-foreground"
        >
          ← Back to incidents
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Payment Retry Storm — Leaderboard
        </h1>
        <p className="mt-2 text-sm text-muted">
          Each engineer&apos;s best completed practice attempt. Users control
          whether they appear here from their profile settings.
        </p>

        {entries.length === 0 ? (
          <p className="mt-10 text-sm text-muted">
            No public attempts yet.{" "}
            <Link
              href="/incidents/payment-retry-storm"
              className="underline hover:text-foreground"
            >
              Be the first.
            </Link>
          </p>
        ) : (
          <div className="mt-10 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border font-mono text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-2 pr-4">Rank</th>
                  <th className="py-2 pr-4">Engineer</th>
                  <th className="py-2 pr-4">Score</th>
                  <th className="py-2 pr-4">Recovery</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr
                    key={`${entry.displayName}-${index}`}
                    className="border-b border-border"
                  >
                    <td className="py-3 pr-4 font-mono text-muted">
                      {index + 1}
                    </td>
                    <td className="py-3 pr-4">{entry.displayName}</td>
                    <td className="py-3 pr-4 font-mono">
                      {entry.score !== null ? formatNumber(entry.score) : "—"}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {entry.recoveryTimeMs !== null
                        ? formatElapsed(entry.recoveryTimeMs)
                        : "—"}
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
