import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getActiveScenarioBySlug } from "@/lib/server/scenario-registry";
import { bindIncidentPass } from "@/lib/server/incident-passes";
import { db } from "@/lib/server/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";

interface BindBody {
  scenarioSlug?: unknown;
}

/**
 * Binds the caller's Incident Pass to exactly one premium scenario
 * (docs/implementation_plan/phase8_admin_promotional_access_referrals.md
 * §11). The client must have already shown the explicit confirmation
 * copy ("Use your Incident Pass for this incident? Once selected, this
 * pass can't be moved to another incident" — phase8loc.md's binding
 * requirement) before calling this; the server does not re-render that
 * copy, it only enforces the irreversible bind itself. Free scenarios
 * are rejected here too — a pass must never bind to a scenario that
 * doesn't need one (spec §32).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ passId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { passId } = await params;
  const body = (await request.json().catch(() => null)) as BindBody | null;
  if (typeof body?.scenarioSlug !== "string") {
    return NextResponse.json({ error: "scenarioSlug is required" }, { status: 400 });
  }

  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, body.scenarioSlug);
  if (entry?.definition.isFree) {
    return NextResponse.json(
      { error: "Free scenarios do not require an Incident Pass" },
      { status: 400 },
    );
  }

  const scenario = await getActiveScenarioBySlug(body.scenarioSlug);
  if (!scenario) {
    return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  }

  const result = await db.transaction((tx) =>
    bindIncidentPass(tx, { passId, userId: user.id, scenario }),
  );

  if (!result.ok) {
    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "not_owner"
          ? 403
          : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ pass: result.pass });
}
