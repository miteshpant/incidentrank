import { NextResponse } from "next/server";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import {
  getActiveScenarioBySlug,
  isBuiltInScenarioCurrentlyPublished,
} from "@/lib/server/scenario-registry";
import { resolveBuiltInScenarioPracticeAccess } from "@/lib/server/resolve-practice-access";

/**
 * The real, private ScenarioSimulationDefinition for a built-in practice
 * scenario — rules, timedEvents, successCondition, failureCondition,
 * actionClassifications, the works. Fetched by GenericIncidentConsole
 * lazily, client-side, rather than ever being passed as a prop from
 * /incidents/[slug]/page.tsx — a prop would be serialized into the page's
 * RSC flight-data payload on every load, before any access gate, which is
 * exactly the leak docs/implementation_plan/seopphase.md §1/§15 requires
 * closed (a crawler or anonymous visitor who never starts the incident
 * must never receive this). Access is gated by the EXACT same
 * resolveBuiltInScenarioPracticeAccess the page itself uses — a locked
 * (paid, unentitled) scenario can never have its simulation fetched here
 * either, matching the page's own render-time gate.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug);
  if (!entry || !(await isBuiltInScenarioCurrentlyPublished(slug))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const scenarioForAccess = await getActiveScenarioBySlug(slug);
  const { access, hasExistingInProgressAttempt } = await resolveBuiltInScenarioPracticeAccess(
    scenarioForAccess,
    entry.definition.isFree,
  );

  if (!access.allowed && !hasExistingInProgressAttempt) {
    return NextResponse.json({ error: "This scenario is not unlocked" }, { status: 403 });
  }

  return NextResponse.json({ simulation: entry.definition.simulation });
}
