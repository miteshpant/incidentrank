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
    scenarioDescription: scenarioMeta.description,
    scenarioDifficulty: scenarioMeta.difficulty,
    scenarioEstimatedMinutes: scenarioMeta.estimatedMinutes,
    scenarioCategory: scenarioMeta.category,
    scenarioSkills: scenarioMeta.skills,
  });
}

interface CandidateSafeScenarioMeta {
  name: string;
  description: string;
  difficulty: string;
  estimatedMinutes: number;
  /** Only populated for built-in scenarios — organization-authored
   * scenarios have no library/category/skills concept. */
  category: string | null;
  skills: string[];
}

/**
 * Candidate-safe scenario metadata only — name, description, difficulty,
 * estimated duration, and (built-in only) category/skills. Never reads/
 * returns rules, conditions, or scoring. For a built-in (incidentrank-
 * owned) scenario this is resolved generically from
 * BUILT_IN_SCENARIO_CATALOG by slug — never a single hardcoded scenario
 * — matching the pattern every other scenario-serving route (e.g. this
 * assessment's own scenario/route.ts) already uses. For organization-
 * authored scenarios this reads only basics.* off the authored document,
 * never the rest of it. The description field (Phase 7.1,
 * docs/implementation_plan/phase7.action.md section 11) is required so
 * the assessment landing page and Incident Brief can render the same
 * candidate-safe briefing every practice flow already shows.
 */
async function loadCandidateSafeScenarioMeta(
  scenarioId: string,
): Promise<CandidateSafeScenarioMeta> {
  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, scenarioId),
  });

  if (!scenario) {
    return {
      name: "Unknown scenario",
      description: "",
      difficulty: "intermediate",
      estimatedMinutes: 15,
      category: null,
      skills: [],
    };
  }

  if (scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
    if (!entry) {
      return {
        name: scenario.name,
        description: "",
        difficulty: "intermediate",
        estimatedMinutes: 15,
        category: null,
        skills: [],
      };
    }
    return {
      name: entry.definition.name,
      description: entry.definition.description,
      difficulty: entry.definition.difficulty,
      estimatedMinutes: entry.definition.estimatedMinutes,
      category: entry.definition.library?.category ?? null,
      skills: entry.definition.library?.skills ?? [],
    };
  }

  const published = await getLatestPublishedVersion(scenario.id);
  const versionRow = published ?? (await getDraftVersion(scenario.id));
  if (!versionRow) {
    return {
      name: scenario.name,
      description: "",
      difficulty: "intermediate",
      estimatedMinutes: 15,
      category: null,
      skills: [],
    };
  }

  const authored = versionRow.definitionJson as AuthoredScenario;
  return {
    name: authored.basics.name,
    description: authored.basics.description,
    difficulty: authored.basics.difficulty,
    estimatedMinutes: authored.basics.estimatedMinutes,
    category: null,
    skills: [],
  };
}
