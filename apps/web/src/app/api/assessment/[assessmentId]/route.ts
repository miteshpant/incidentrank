import { NextResponse } from "next/server";
import { assessments, attempts, organizations, scenarios } from "@incidentrank/db";
import { eq } from "drizzle-orm";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import type { AuthoredScenario } from "@incidentrank/scenarios/authoring";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getDraftVersion, getLatestPublishedVersion } from "@/lib/server/scenario-access";

/**
 * Candidate-facing assessment preview/state — distinct from the org-admin
 * assessment detail route. Authorization here is candidate-identity based:
 * the signed-in user must already be the claimed owner of an
 * assessment_candidates row for this assessment (set by invite accept).
 * Never exposes other candidates, scoring bands, or success conditions.
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

  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, assessment.organizationId),
  });

  const attempt = candidate.attemptId
    ? await db.query.attempts.findFirst({
        where: eq(attempts.id, candidate.attemptId),
      })
    : null;

  const scenarioMeta = await loadCandidateSafeScenarioMeta(assessment.scenarioId);

  return NextResponse.json({
    organizationName: organization?.name ?? "",
    assessmentName: assessment.name,
    assessmentStatus: assessment.status,
    attemptId: attempt?.id ?? null,
    attemptStatus: attempt?.status ?? null,
    scenarioName: scenarioMeta.name,
    scenarioDifficulty: scenarioMeta.difficulty,
    scenarioEstimatedMinutes: scenarioMeta.estimatedMinutes,
  });
}

interface CandidateSafeScenarioMeta {
  name: string;
  difficulty: string;
  estimatedMinutes: number;
}

/**
 * Candidate-safe scenario metadata only — name, difficulty, estimated
 * duration. Never reads/returns rules, conditions, or scoring. For a
 * built-in (incidentrank-owned) scenario this is resolved generically
 * from BUILT_IN_SCENARIO_CATALOG by slug — never a single hardcoded
 * scenario — matching the pattern every other scenario-serving route
 * (e.g. this assessment's own scenario/route.ts) already uses. For
 * organization-authored scenarios this reads only basics.* off the
 * authored document, never the rest of it.
 */
async function loadCandidateSafeScenarioMeta(
  scenarioId: string,
): Promise<CandidateSafeScenarioMeta> {
  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, scenarioId),
  });

  if (!scenario) {
    return { name: "Unknown scenario", difficulty: "intermediate", estimatedMinutes: 15 };
  }

  if (scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
    if (!entry) {
      return { name: scenario.name, difficulty: "intermediate", estimatedMinutes: 15 };
    }
    return {
      name: entry.definition.name,
      difficulty: entry.definition.difficulty,
      estimatedMinutes: entry.definition.estimatedMinutes,
    };
  }

  const published = await getLatestPublishedVersion(scenario.id);
  const versionRow = published ?? (await getDraftVersion(scenario.id));
  if (!versionRow) {
    return { name: scenario.name, difficulty: "intermediate", estimatedMinutes: 15 };
  }

  const authored = versionRow.definitionJson as AuthoredScenario;
  return {
    name: authored.basics.name,
    difficulty: authored.basics.difficulty,
    estimatedMinutes: authored.basics.estimatedMinutes,
  };
}
