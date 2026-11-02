import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { scenarios } from "@incidentrank/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { db } from "@/lib/server/db";
import { getActiveWeeklyChallenge } from "@/lib/server/weekly-challenge";
import { getWeeklyChallengeStats } from "@/lib/server/analytics";
import { appBaseUrl } from "@/lib/server/app-url";
import { WeeklyChallengeForm } from "./weekly-challenge-form";
import { CopyableLink } from "./copyable-link";

/**
 * Platform-admin Weekly Challenge management (phase-challege-version.md
 * §2/§13). Same gate pattern as every other admin page —
 * isAdminPortalEnabled() -> notFound(), getOrCreateCurrentUser(),
 * loadAdminMembership() -> notFound().
 */
export async function WeeklyChallengeView() {
  if (!isAdminPortalEnabled()) notFound();

  const user = await getOrCreateCurrentUser();
  if (!user) return null;

  const membership = await loadAdminMembership(user);
  if (!membership.ok) notFound();

  const [active, builtInScenarios, stats] = await Promise.all([
    getActiveWeeklyChallenge(),
    db.query.scenarios.findMany({
      where: eq(scenarios.ownershipType, "incidentrank"),
      orderBy: (table, { asc }) => [asc(table.slug)],
      columns: { id: true, slug: true, name: true, isFree: true },
    }),
    getWeeklyChallengeStats("all"),
  ]);

  const activeScenario = active ? builtInScenarios.find((row) => row.id === active.scenarioId) : null;

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Weekly Challenge</h1>

      <div className="mt-8 rounded-md border border-border p-4">
        <p className="font-mono text-[10px] uppercase tracking-wide text-muted">
          Current Weekly Challenge
        </p>
        {active && activeScenario ? (
          <div className="mt-2">
            <p className="text-sm font-medium">{activeScenario.name}</p>
            <p className="mt-1 font-mono text-xs text-muted">
              Status: active · Started {active.startsAt.toISOString().slice(0, 10)}
              {active.endsAt ? ` · Ends ${active.endsAt.toISOString().slice(0, 10)}` : ""}
            </p>
            <CopyableLink url={`${appBaseUrl()}/incidents/${activeScenario.slug}`} />
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">No active Weekly Challenge.</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Views" value={stats.views} />
        <StatCard label="Starts" value={stats.starts} />
        <StatCard label="Finishes" value={stats.finishes} />
        <StatCard label="Challenges Created" value={stats.challengesCreated} />
        <StatCard label="Links Opened" value={stats.linksOpened} />
        <StatCard label="Accepted" value={stats.accepted} />
      </div>

      <div className="mt-8">
        <WeeklyChallengeForm
          scenarios={builtInScenarios}
          activeScenarioId={active?.scenarioId ?? null}
        />
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="font-mono text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
