import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate, requireActiveOrganization } from "@/lib/server/organization-auth";
import { loadOrgScenario, listScenarioVersions } from "@/lib/server/scenario-access";
import { saveScenarioDraft, archiveScenario } from "@/lib/server/scenario-authoring";
import { validateAuthoredScenario, type AuthoredScenario } from "@incidentrank/scenarios/authoring";

interface PatchScenarioBody {
  action?: unknown;
  definition?: unknown;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; scenarioId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, scenarioId } = await params;
  const result = await loadOrgScenario(slug, scenarioId, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }

  const versions = await listScenarioVersions(scenarioId);

  return NextResponse.json({ scenario: result.scenario, versions });
}

/**
 * Two actions, both requiring owner/admin:
 *  - { action: "save_draft", definition } — overwrites the draft's
 *    authored content. Never validated strictly (a draft may be
 *    incomplete); the response includes validation errors for the UI to
 *    surface inline, but saving always succeeds structurally.
 *  - { action: "archive" } — archives the scenario.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; scenarioId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, scenarioId } = await params;
  const result = await loadOrgScenario(slug, scenarioId, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }
  if (!canMutate(result.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeCheck = requireActiveOrganization(result.organization);
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.reason }, { status: activeCheck.status });
  }

  const body = (await request.json().catch(() => null)) as PatchScenarioBody | null;

  if (body?.action === "archive") {
    const archived = await archiveScenario(result.scenario);
    return NextResponse.json({ scenario: archived });
  }

  if (body?.action === "save_draft") {
    if (typeof body.definition !== "object" || body.definition === null) {
      return NextResponse.json({ error: "definition is required" }, { status: 400 });
    }

    const definition = body.definition as AuthoredScenario;
    const saveResult = await saveScenarioDraft(scenarioId, definition);
    if (!saveResult.ok) {
      return NextResponse.json(
        { error: "No draft exists for this scenario — edit the published version first" },
        { status: 409 },
      );
    }

    const errors = validateAuthoredScenario(definition);
    return NextResponse.json({ draft: saveResult.draft, validationErrors: errors });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
