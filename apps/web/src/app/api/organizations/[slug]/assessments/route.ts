import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessments } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import {
  canMutate,
  loadOrganizationMembership,
  requireActiveOrganization,
} from "@/lib/server/organization-auth";
import { getActiveScenarioById } from "@/lib/server/scenario-registry";

interface CreateAssessmentBody {
  name?: unknown;
  scenarioId?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.status === 404 ? "Not found" : "Forbidden" },
      { status: membership.status },
    );
  }
  if (!canMutate(membership.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeCheck = requireActiveOrganization(membership.organization);
  if (!activeCheck.ok) {
    return NextResponse.json({ error: activeCheck.reason }, { status: activeCheck.status });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateAssessmentBody
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const scenarioId =
    typeof body?.scenarioId === "string" ? body.scenarioId : "";

  if (name.length === 0 || scenarioId.length === 0) {
    return NextResponse.json(
      { error: "name and scenarioId are required" },
      { status: 400 },
    );
  }

  const scenario = await getActiveScenarioById(scenarioId, membership.organization.id);
  if (!scenario) {
    return NextResponse.json({ error: "Unknown scenario" }, { status: 404 });
  }

  const [assessment] = await db
    .insert(assessments)
    .values({
      organizationId: membership.organization.id,
      name,
      scenarioId: scenario.id,
      scenarioVersion: scenario.version,
      status: "draft",
      createdByUserId: user.id,
    })
    .returning();

  return NextResponse.json({ assessment });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await params;
  const membership = await loadOrganizationMembership(slug, user);
  if (!membership.ok) {
    return NextResponse.json(
      { error: membership.status === 404 ? "Not found" : "Forbidden" },
      { status: membership.status },
    );
  }

  const rows = await db.query.assessments.findMany({
    where: eq(assessments.organizationId, membership.organization.id),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({ assessments: rows });
}
