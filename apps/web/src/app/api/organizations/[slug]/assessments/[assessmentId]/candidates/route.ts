import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { assessmentCandidates } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canMutate } from "@/lib/server/organization-auth";
import { loadOrgAssessment } from "@/lib/server/assessment-access";
import {
  generateInviteToken,
  hashInviteToken,
  normalizeEmail,
  INVITE_EXPIRY_MS,
} from "@/lib/server/invite-token";

interface CreateCandidateBody {
  email?: unknown;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
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
    | CreateCandidateBody
    | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required" },
      { status: 400 },
    );
  }

  const normalizedEmail = normalizeEmail(email);

  const existing = await db.query.assessmentCandidates.findFirst({
    where: (table, { and: andFn, eq: eqFn }) =>
      andFn(
        eqFn(table.assessmentId, assessmentId),
        eqFn(table.normalizedEmail, normalizedEmail),
      ),
  });
  if (existing) {
    return NextResponse.json(
      { error: "This candidate has already been invited to this assessment" },
      { status: 409 },
    );
  }

  const token = generateInviteToken();
  const inviteTokenHash = hashInviteToken(token);
  const inviteExpiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

  const [candidate] = await db
    .insert(assessmentCandidates)
    .values({
      assessmentId,
      email,
      normalizedEmail,
      status: "invited",
      inviteTokenHash,
      inviteExpiresAt,
    })
    .returning();

  return NextResponse.json({
    candidate,
    inviteToken: token,
    inviteUrl: `/assessment/invite/${token}`,
  });
}

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
    where: eq(assessmentCandidates.assessmentId, assessmentId),
    with: { user: true },
    orderBy: (table, { desc }) => [desc(table.invitedAt)],
  });

  return NextResponse.json({ candidates });
}
