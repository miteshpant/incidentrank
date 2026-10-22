import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { attempts } from "@incidentrank/db";
import { BUILT_IN_SCENARIO_CATALOG, getBuiltInScenarioEntry } from "@incidentrank/scenarios";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { getActiveScenarioBySlug } from "@/lib/server/scenario-registry";
import { evaluatePracticeAccess } from "@/lib/server/practice-access";
import { isDevUnlockPaidScenariosRequest } from "@/lib/server/dev-unlock";

interface CreateAttemptBody {
  scenarioSlug?: unknown;
}

export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateAttemptBody
    | null;
  const scenarioSlug = body?.scenarioSlug;
  if (typeof scenarioSlug !== "string") {
    return NextResponse.json(
      { error: "scenarioSlug is required" },
      { status: 400 },
    );
  }

  const scenario = await getActiveScenarioBySlug(scenarioSlug);
  if (!scenario) {
    return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  }

  const entry = getBuiltInScenarioEntry(BUILT_IN_SCENARIO_CATALOG, scenario.slug);
  const devUnlockPaid = isDevUnlockPaidScenariosRequest(request.headers.get("host"));
  const access = evaluatePracticeAccess(
    { isFree: entry?.definition.isFree ?? false },
    { devUnlockPaid },
  );
  if (!access.allowed) {
    return NextResponse.json(
      { error: "This scenario is not available in practice mode without an entitlement." },
      { status: 403 },
    );
  }

  const [attempt] = await db
    .insert(attempts)
    .values({
      userId: user.id,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      attemptType: "practice",
      status: "in_progress",
    })
    .returning();

  return NextResponse.json({ attempt });
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db.query.attempts.findMany({
    where: eq(attempts.userId, user.id),
    orderBy: [desc(attempts.createdAt)],
    with: { scenario: true },
  });

  return NextResponse.json({ attempts: rows });
}
