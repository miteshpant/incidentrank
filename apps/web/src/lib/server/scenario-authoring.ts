import "server-only";
import { and, eq } from "drizzle-orm";
import {
  scenarios,
  scenarioVersions,
  type Scenario,
  type ScenarioVersion,
} from "@incidentrank/db";
import {
  compileAuthoredScenario,
  validateAuthoredScenario,
  type AuthoredScenario,
  type AuthoredScenarioValidationError,
} from "@incidentrank/scenarios/authoring";
import { db } from "./db";
import { getDraftVersion, getLatestPublishedVersion } from "./scenario-access";

/**
 * Creates a new organization-owned scenario identity row plus its first
 * draft version. A scenario and its first draft are created together —
 * there is never a scenario with zero versions, which keeps every other
 * query ("does this scenario have a draft/published version") simple.
 */
export async function createOrgScenario(
  organizationId: string,
  userId: string,
  name: string,
  initialDefinition: AuthoredScenario,
): Promise<{ scenario: Scenario; draft: ScenarioVersion }> {
  const [scenario] = await db
    .insert(scenarios)
    .values({
      slug: initialDefinition.basics.slug,
      name,
      isActive: true,
      ownershipType: "organization",
      organizationId,
      visibility: "private",
      status: "draft",
      createdByUserId: userId,
    })
    .returning();
  if (!scenario) throw new Error("Failed to create scenario");

  const [draft] = await db
    .insert(scenarioVersions)
    .values({
      scenarioId: scenario.id,
      version: 1,
      definitionJson: initialDefinition,
      status: "draft",
      createdByUserId: userId,
    })
    .returning();
  if (!draft) throw new Error("Failed to create initial scenario draft");

  return { scenario, draft };
}

export type SaveDraftResult =
  | { ok: true; draft: ScenarioVersion }
  | { ok: false; reason: "no_draft" };

/**
 * Overwrites the single mutable draft's definitionJson. Never touches a
 * published version — editing in place is only ever legal while
 * status: "draft", which is exactly what this function is scoped to.
 */
export async function saveScenarioDraft(
  scenarioId: string,
  definition: AuthoredScenario,
): Promise<SaveDraftResult> {
  const draft = await getDraftVersion(scenarioId);
  if (!draft) return { ok: false, reason: "no_draft" };

  const [updated] = await db
    .update(scenarioVersions)
    .set({ definitionJson: definition, updatedAt: new Date() })
    .where(eq(scenarioVersions.id, draft.id))
    .returning();
  if (!updated) return { ok: false, reason: "no_draft" };

  return { ok: true, draft: updated };
}

export type PublishScenarioResult =
  | { ok: true; published: ScenarioVersion; scenario: Scenario }
  | { ok: false; reason: "no_draft" }
  | { ok: false; reason: "invalid"; errors: AuthoredScenarioValidationError[] };

/**
 * Publishing: validates the current draft, flips it to "published" with
 * publishedAt stamped, and flips the scenario identity row to
 * status:"published". Once published, a scenario_versions row is never
 * mutated again — see docs/architecture.md. Returns the full validation
 * error list on failure, per the spec's "never publish invalid executable
 * definitions" requirement.
 */
export async function publishScenarioDraft(
  scenario: Scenario,
): Promise<PublishScenarioResult> {
  const draft = await getDraftVersion(scenario.id);
  if (!draft) return { ok: false, reason: "no_draft" };

  const authored = draft.definitionJson as AuthoredScenario;
  const errors = validateAuthoredScenario(authored);
  if (errors.length > 0) {
    return { ok: false, reason: "invalid", errors };
  }

  // Compilation is re-verified here (not just structural validation) so a
  // definition that validates but somehow fails to compile can never be
  // published — belt-and-suspenders around the same invariant.
  const compiled = compileAuthoredScenario(authored);
  if (!compiled.ok) {
    return { ok: false, reason: "invalid", errors: compiled.errors };
  }

  const now = new Date();

  const [published] = await db
    .update(scenarioVersions)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(and(eq(scenarioVersions.id, draft.id), eq(scenarioVersions.status, "draft")))
    .returning();
  if (!published) return { ok: false, reason: "no_draft" };

  const [updatedScenario] = await db
    .update(scenarios)
    .set({ status: "published", name: authored.basics.name, updatedAt: now })
    .where(eq(scenarios.id, scenario.id))
    .returning();
  if (!updatedScenario) throw new Error("Failed to update scenario after publish");

  return { ok: true, published, scenario: updatedScenario };
}

export type CreateNewDraftResult =
  | { ok: true; draft: ScenarioVersion }
  | { ok: false; reason: "draft_already_exists" }
  | { ok: false; reason: "no_published_version" };

/**
 * "Edit" on a published scenario: creates a new draft version seeded from
 * the latest published version's content, at the next version number.
 * Never mutates the published row. If a draft already exists, returns it
 * unchanged rather than creating a second one — a scenario has at most
 * one draft at a time by construction.
 */
export async function createNewDraftFromPublished(
  scenario: Scenario,
  userId: string,
): Promise<CreateNewDraftResult> {
  const existingDraft = await getDraftVersion(scenario.id);
  if (existingDraft) return { ok: false, reason: "draft_already_exists" };

  const latestPublished = await getLatestPublishedVersion(scenario.id);
  if (!latestPublished) return { ok: false, reason: "no_published_version" };

  const [draft] = await db
    .insert(scenarioVersions)
    .values({
      scenarioId: scenario.id,
      version: latestPublished.version + 1,
      definitionJson: latestPublished.definitionJson,
      status: "draft",
      createdByUserId: userId,
    })
    .returning();
  if (!draft) throw new Error("Failed to create new draft");

  await db
    .update(scenarios)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(scenarios.id, scenario.id));

  return { ok: true, draft };
}

/** Archives a scenario: it becomes unavailable for new assessments; existing assessments/attempts are unaffected. */
export async function archiveScenario(scenario: Scenario): Promise<Scenario> {
  const [updated] = await db
    .update(scenarios)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(scenarios.id, scenario.id))
    .returning();
  if (!updated) throw new Error("Failed to archive scenario");
  return updated;
}
