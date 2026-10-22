import "server-only";
import { and, desc, eq } from "drizzle-orm";
import {
  scenarios,
  scenarioVersions,
  type OrganizationMember,
  type Scenario,
  type ScenarioVersion,
  type User,
} from "@incidentrank/db";
import { db } from "./db";
import { loadOrganizationMembership } from "./organization-auth";

export type LoadOrgScenarioResult =
  | { ok: true; scenario: Scenario; membership: OrganizationMember }
  | { ok: false; status: 404 | 403 };

/**
 * Loads an organization-owned scenario and verifies (a) the given user is
 * a member of the owning organization and (b) the scenario actually
 * belongs to the organization identified by `orgSlug`. This is the
 * privacy boundary for every scenario-authoring route — mirrors
 * loadOrgAssessment exactly. A scenario with ownershipType "incidentrank"
 * (built-in) never has an organizationId and can never be loaded through
 * this path, by construction.
 */
export async function loadOrgScenario(
  orgSlug: string,
  scenarioId: string,
  user: User,
): Promise<LoadOrgScenarioResult> {
  const membership = await loadOrganizationMembership(orgSlug, user);
  if (!membership.ok) return { ok: false, status: membership.status };

  const scenario = await db.query.scenarios.findFirst({
    where: eq(scenarios.id, scenarioId),
  });
  if (
    !scenario ||
    scenario.ownershipType !== "organization" ||
    scenario.organizationId !== membership.organization.id
  ) {
    return { ok: false, status: 404 };
  }

  return { ok: true, scenario, membership: membership.membership };
}

/** All versions of a scenario, newest first. Caller must have already authorized access to the scenario. */
export async function listScenarioVersions(scenarioId: string): Promise<ScenarioVersion[]> {
  return db.query.scenarioVersions.findMany({
    where: eq(scenarioVersions.scenarioId, scenarioId),
    orderBy: [desc(scenarioVersions.version)],
  });
}

/** The single mutable draft version for a scenario, if one exists. A scenario has at most one draft at a time. */
export async function getDraftVersion(scenarioId: string): Promise<ScenarioVersion | null> {
  const row = await db.query.scenarioVersions.findFirst({
    where: and(eq(scenarioVersions.scenarioId, scenarioId), eq(scenarioVersions.status, "draft")),
  });
  return row ?? null;
}

/** The latest published version for a scenario, if one exists. */
export async function getLatestPublishedVersion(
  scenarioId: string,
): Promise<ScenarioVersion | null> {
  const row = await db.query.scenarioVersions.findFirst({
    where: and(
      eq(scenarioVersions.scenarioId, scenarioId),
      eq(scenarioVersions.status, "published"),
    ),
    orderBy: [desc(scenarioVersions.version)],
  });
  return row ?? null;
}

/**
 * Scenarios an organization's assessment selector may offer, per the
 * Phase 5 spec: the org's own scenarios that have at least one published
 * version and are not archived. Never another organization's scenarios,
 * never drafts-only scenarios, never archived scenarios.
 */
export async function listOrgAssessableScenarios(organizationId: string): Promise<
  Array<{ scenario: Scenario; latestPublishedVersion: ScenarioVersion }>
> {
  const rows = await db.query.scenarios.findMany({
    where: and(
      eq(scenarios.organizationId, organizationId),
      eq(scenarios.ownershipType, "organization"),
      eq(scenarios.status, "published"),
      eq(scenarios.isActive, true),
    ),
  });

  const withVersions = await Promise.all(
    rows.map(async (scenario) => {
      const latestPublishedVersion = await getLatestPublishedVersion(scenario.id);
      return latestPublishedVersion ? { scenario, latestPublishedVersion } : null;
    }),
  );

  return withVersions.filter(
    (row): row is { scenario: Scenario; latestPublishedVersion: ScenarioVersion } => row !== null,
  );
}
