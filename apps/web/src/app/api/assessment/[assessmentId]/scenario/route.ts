import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { assessments, scenarios, scenarioVersions } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry, type CandidateUIDescriptor } from "@incidentrank/scenarios";
import { authoredScenarioToCandidateUI, type AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { resolveSimulationDefinition } from "@/lib/server/scenario-registry";

/**
 * Resolves candidate-UI descriptor generically: for an incidentrank-owned
 * scenario, from its BUILT_IN_SCENARIO_CATALOG entry (never a per-slug
 * branch — see docs/implementation_plan/phase6.md); for an
 * organization-owned scenario, derived from its own persisted authored
 * document. A catalog entry missing for a slug is a configuration bug —
 * surfaced via the empty-descriptor fallback rather than crashing the
 * route, since presentation metadata (unlike scoring) is not safety
 * critical.
 */
async function resolveCandidateUI(
  scenario: { id: string; slug: string; ownershipType: string },
  version: number,
): Promise<CandidateUIDescriptor> {
  if (scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
    return entry?.candidateUI ?? { metrics: [], controls: [], components: [] };
  }

  const row = await db.query.scenarioVersions.findFirst({
    where: and(
      eq(scenarioVersions.scenarioId, scenario.id),
      eq(scenarioVersions.version, version),
    ),
  });
  if (!row) return { metrics: [], controls: [], components: [] };

  return authoredScenarioToCandidateUI(row.definitionJson as AuthoredScenario);
}

/**
 * The candidate-safe presentation payload for an assessment's scenario
 * (reworked in Phase 5.1 — see docs/architecture.md's "Assessment
 * Runtime" section). Returns only what is safe to show before/around the
 * incident: scenario identity, architecture topology, and control
 * definitions (which values exist for each control — the candidate must
 * know what they are allowed to set). It deliberately does NOT return a
 * `ScenarioSimulationDefinition` — no rules, no timed-event definitions,
 * no success/failure conditions, no scoring, no revenue/cost
 * configuration. Those fields simply are not read here at all, let alone
 * returned.
 *
 * Live metric values, control values, component health, and events are
 * NOT served from this route — they come from the server-authoritative
 * runtime endpoints (`GET /api/attempts/[attemptId]/runtime`,
 * `POST /api/attempts/[attemptId]/advance`,
 * `POST /api/attempts/[attemptId]/actions`), which project only a
 * `RuntimeView` (packages/simulator's `toRuntimeView`) — a type with no
 * field for any hidden scenario behavior either.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assessmentId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assessmentId } = await params;

  const assessment = await db.query.assessments.findFirst({
    where: eq(assessments.id, assessmentId),
  });
  if (!assessment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const candidate = await db.query.assessmentCandidates.findFirst({
    where: (table, { and: andFn, eq: eqFn }) =>
      andFn(eqFn(table.assessmentId, assessmentId), eqFn(table.userId, user.id)),
  });
  if (!candidate) {
    return NextResponse.json(
      { error: "You have not been invited to this assessment" },
      { status: 403 },
    );
  }

  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, assessment.scenarioId),
  });
  if (!scenario) {
    return NextResponse.json({ error: "Scenario not found" }, { status: 404 });
  }

  const simulation = await resolveSimulationDefinition(scenario, assessment.scenarioVersion);
  if (!simulation) {
    return NextResponse.json(
      { error: "This assessment's scenario version could not be resolved" },
      { status: 409 },
    );
  }

  const candidateUI = await resolveCandidateUI(scenario, assessment.scenarioVersion);

  return NextResponse.json({
    scenarioSlug: scenario.slug,
    architecture: simulation.architecture,
    controls: simulation.controls,
    candidateUI,
  });
}
