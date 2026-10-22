import { notFound } from "next/navigation";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { evaluatePracticeAccess } from "@/lib/practice-access";
import { isDevUnlockPaidScenarios } from "@/lib/server/dev-unlock";
import { GenericIncidentConsole } from "@/components/scenario-console/generic-incident-console";
import { LockedScenarioScreen } from "@/components/scenario-console/locked-scenario-screen";

// Per-scenario, per-request routing decision (unknown slug -> notFound(),
// locked vs. playable) — never a meaningful static/prerendered version,
// same reasoning as organizations/[slug]/page.tsx's own `instant = false`.
export const instant = false;

/**
 * The generic practice route for every built-in scenario except Payment
 * Retry Storm, which keeps its own hand-written route/components
 * unchanged (apps/web/src/app/incidents/payment-retry-storm) per the
 * Phase 6 promotion contract: "adding scenario #21 requires no new
 * route/component." A paid scenario renders a locked state instead of
 * the console — see practice-access.ts; the console component is never
 * even mounted for a locked scenario, so the local simulator never runs
 * for a scenario the candidate isn't entitled to practice-play.
 */
export default async function ScenarioPracticePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
  if (!entry) notFound();

  const devUnlockPaid = await isDevUnlockPaidScenarios();
  const access = evaluatePracticeAccess({ isFree: entry.definition.isFree }, { devUnlockPaid });
  if (!access.allowed) {
    return <LockedScenarioScreen scenario={entry.definition} />;
  }

  return (
    <GenericIncidentConsole
      scenario={entry.definition}
      simulation={entry.definition.simulation}
      candidateUI={entry.candidateUI}
    />
  );
}
