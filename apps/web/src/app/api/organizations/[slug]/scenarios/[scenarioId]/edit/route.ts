import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate } from "@/lib/server/organization-auth";
import { loadOrgScenario } from "@/lib/server/scenario-access";
import { createNewDraftFromPublished } from "@/lib/server/scenario-authoring";

/**
 * "Edit" on a published scenario: creates a new draft seeded from the
 * latest published version, per the spec's immutable-versioning model
 * (v1 published -> Edit -> v2 draft). Existing assessments stay pinned to
 * v1 — this route never touches an existing assessment's scenarioVersion.
 */
export async function POST(
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
  if (!canMutate(result.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const draftResult = await createNewDraftFromPublished(result.scenario, user.id);

  if (!draftResult.ok) {
    if (draftResult.reason === "draft_already_exists") {
      return NextResponse.json(
        { error: "A draft already exists for this scenario" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Scenario has no published version to edit" },
      { status: 409 },
    );
  }

  return NextResponse.json({ draft: draftResult.draft });
}
