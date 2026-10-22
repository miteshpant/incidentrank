import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessments } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate } from "@/lib/server/organization-auth";
import { loadOrgAssessment } from "@/lib/server/assessment-access";

interface PatchAssessmentBody {
  status?: unknown;
}

const ALLOWED_STATUSES = new Set(["draft", "active", "closed"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; assessmentId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, assessmentId } = await params;
  const result = await loadOrgAssessment(slug, assessmentId, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }

  const candidates = await db.query.assessmentCandidates.findMany({
    where: (table, { eq: eqFn }) => eqFn(table.assessmentId, assessmentId),
    with: { user: true, attempt: true },
  });

  return NextResponse.json({ assessment: result.assessment, candidates });
}

/** Status transitions only, for Phase 4 — draft → active → closed. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; assessmentId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, assessmentId } = await params;
  const result = await loadOrgAssessment(slug, assessmentId, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }
  if (!canMutate(result.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | PatchAssessmentBody
    | null;
  const status = body?.status;
  if (typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const [updated] = await db
    .update(assessments)
    .set({ status: status as "draft" | "active" | "closed", updatedAt: new Date() })
    .where(eq(assessments.id, assessmentId))
    .returning();

  return NextResponse.json({ assessment: updated });
}
