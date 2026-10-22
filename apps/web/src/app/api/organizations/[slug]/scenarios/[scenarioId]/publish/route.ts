import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate } from "@/lib/server/organization-auth";
import { loadOrgScenario } from "@/lib/server/scenario-access";
import { publishScenarioDraft } from "@/lib/server/scenario-authoring";

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

  const publishResult = await publishScenarioDraft(result.scenario);

  if (!publishResult.ok) {
    if (publishResult.reason === "no_draft") {
      return NextResponse.json(
        { error: "No draft exists for this scenario" },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Scenario failed validation", validationErrors: publishResult.errors },
      { status: 422 },
    );
  }

  return NextResponse.json({
    scenario: publishResult.scenario,
    published: publishResult.published,
  });
}
