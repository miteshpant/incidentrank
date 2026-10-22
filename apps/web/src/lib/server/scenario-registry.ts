import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { scenarios, scenarioVersions, type Scenario } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import type { ScenarioSimulationDefinition } from "@incidentrank/simulator";
import { compileAuthoredScenario } from "@incidentrank/scenarios/authoring";
import { db } from "./db";

/**
 * A scenario row augmented with its resolved "current version" number.
 * `scenarios` itself carries no version column (Phase 5) — version is
 * authoritative from a different place depending on ownershipType, see
 * resolveCurrentVersion below. Callers that need to pin an attempt/
 * assessment to a specific scenario always want this shape, never the
 * bare DB row.
 */
export type ScenarioWithVersion = Scenario & { version: number };

/**
 * True only for a row that is BOTH incidentrank-owned AND recognized by
 * the built-in catalog by slug — every built-in scenario is playable,
 * derived entirely from BUILT_IN_SCENARIO_CATALOG, per
 * docs/implementation_plan/phase6.md's data-driven-registry mandate.
 * Adding scenario #21 (or #101) to the catalog makes it playable
 * automatically; this file is never touched.
 *
 * Checking `ownershipType` here is not optional: scenarios.slug is now
 * scoped per-namespace (see packages/db/src/schema.ts's partial unique
 * indexes) — a built-in catalog slug and a private organization-owned
 * scenario's slug may legitimately coincide. A slug-only check would
 * match whichever row happens to be in the DB regardless of ownership,
 * which could leak a private organization scenario as if it were a
 * public built-in one. Always require both.
 */
function isPlayableBuiltinScenario(row: Pick<Scenario, "slug" | "ownershipType">): boolean {
  return (
    row.ownershipType === "incidentrank" &&
    getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, row.slug) !== null
  );
}

/**
 * Resolves the exact engine-executable scenario definition for a stored
 * (scenarioId, slug, ownershipType, version) combination. Branches by
 * ownership, per the Phase 5 data model:
 *
 *   - incidentrank-owned: looked up directly from BUILT_IN_SCENARIO_CATALOG
 *     by slug — never touches the DB. Version is validated against the
 *     catalog entry's own ScenarioDefinition.version; a mismatch (an
 *     attempt pinned to a version the current catalog entry no longer
 *     represents) resolves to null rather than silently serving the
 *     wrong content — built-in scenarios have no historical-version
 *     table (see resolveCurrentVersion below), so a version bump here
 *     is a deliberate breaking change for in-flight attempts, not a
 *     silent one.
 *   - organization-owned: the immutable `scenario_versions` row for
 *     (scenarioId, version) is loaded and compiled via
 *     compileAuthoredScenario. Only a *published* version may be
 *     resolved — a draft is never executable through this path, so an
 *     attempt/assessment can never end up pinned to content that could
 *     still change.
 *
 * Returns null if the version cannot be resolved — callers must fail
 * safely rather than falling back to a different version.
 */
export async function resolveSimulationDefinition(
  scenario: Pick<Scenario, "id" | "slug" | "ownershipType">,
  version: number,
): Promise<ScenarioSimulationDefinition | null> {
  if (scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
    if (!entry || entry.definition.version !== version) return null;
    return entry.definition.simulation;
  }

  const row = await db.query.scenarioVersions.findFirst({
    where: and(
      eq(scenarioVersions.scenarioId, scenario.id),
      eq(scenarioVersions.version, version),
      eq(scenarioVersions.status, "published"),
    ),
  });
  if (!row) return null;

  const compiled = compileAuthoredScenario(row.definitionJson);
  return compiled.ok ? compiled.definition.simulation : null;
}

/**
 * The authoritative "current version" number for a scenario row, per the
 * Phase 5 data model: ScenarioDefinition.version for built-ins (read from
 * the catalog entry, never hardcoded), MAX(scenario_versions.version)
 * WHERE status='published' for organization-owned scenarios. Returns
 * null if an organization-owned scenario has no published version yet
 * (e.g. still a draft), or a built-in slug has no catalog entry —
 * callers must treat either as "not currently assessable/playable."
 */
async function resolveCurrentVersion(scenario: Scenario): Promise<number | null> {
  if (scenario.ownershipType === "incidentrank") {
    const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
    return entry?.definition.version ?? null;
  }

  const row = await db.query.scenarioVersions.findFirst({
    where: and(
      eq(scenarioVersions.scenarioId, scenario.id),
      eq(scenarioVersions.status, "published"),
    ),
    orderBy: [desc(scenarioVersions.version)],
  });
  return row?.version ?? null;
}

export async function getActiveScenarioBySlug(
  slug: string,
): Promise<ScenarioWithVersion | null> {
  if (getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, slug) === null) return null;

  // Scoped to ownershipType "incidentrank" explicitly — scenarios.slug is
  // namespaced per ownership type (see isPlayableBuiltinScenario's doc
  // comment), so a bare slug match here could otherwise hit a private
  // organization-owned row that happens to share this slug.
  const row = await db.query.scenarios.findFirst({
    where: and(
      eq(scenarios.slug, slug),
      eq(scenarios.ownershipType, "incidentrank"),
      eq(scenarios.isActive, true),
    ),
  });
  if (!row) return null;

  const version = await resolveCurrentVersion(row);
  return version === null ? null : { ...row, version };
}

/**
 * Resolves a scenario an assessment may be created against: either a
 * built-in playable scenario, or — when `organizationId` is supplied —
 * that exact organization's own published, non-archived, active scenario.
 * Never resolves a draft, an archived scenario, or another organization's
 * scenario, which is the privacy boundary this function exists to
 * enforce (see the spec's "Assessment Integration"/"Privacy" sections).
 */
export async function getActiveScenarioById(
  scenarioId: string,
  organizationId?: string,
): Promise<ScenarioWithVersion | null> {
  const row = await db.query.scenarios.findFirst({
    where: and(eq(scenarios.id, scenarioId), eq(scenarios.isActive, true)),
  });
  if (!row) return null;

  if (isPlayableBuiltinScenario(row)) {
    const version = await resolveCurrentVersion(row);
    return version === null ? null : { ...row, version };
  }

  if (
    organizationId &&
    row.ownershipType === "organization" &&
    row.organizationId === organizationId &&
    row.status === "published"
  ) {
    const version = await resolveCurrentVersion(row);
    return version === null ? null : { ...row, version };
  }

  return null;
}

/**
 * Scenarios an assessment may be created against: every built-in playable
 * scenario, plus — when `organizationId` is supplied — that organization's
 * own published, non-archived scenarios. Never another organization's
 * scenarios, never drafts, never archived scenarios.
 */
export async function listAssessableScenarios(
  organizationId?: string,
): Promise<ScenarioWithVersion[]> {
  const rows = await db.query.scenarios.findMany({
    where: eq(scenarios.isActive, true),
  });

  const eligible = rows.filter(
    (row) =>
      isPlayableBuiltinScenario(row) ||
      (organizationId !== undefined &&
        row.ownershipType === "organization" &&
        row.organizationId === organizationId &&
        row.status === "published"),
  );

  const withVersions = await Promise.all(
    eligible.map(async (row) => {
      const version = await resolveCurrentVersion(row);
      return version === null ? null : { ...row, version };
    }),
  );
  return withVersions.filter((row): row is ScenarioWithVersion => row !== null);
}
