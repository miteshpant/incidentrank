import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { organizations } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { logAdminAction } from "@/lib/server/admin-audit";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { adjustOrganizationCredit } from "@/lib/server/organization-credits";

interface AdjustCreditsBody {
  quantity?: unknown;
  reason?: unknown;
}

/**
 * Platform-admin credit adjustment (docs/implementation_plan/
 * phase10b.md §39/§40). Allows +N or -N but requires a reason; never
 * permits an adjustment that would drive the organization's available
 * balance below 0. Never edits/deletes historical ledger rows — always
 * inserts a new one, and always writes a platform admin_audit_events
 * entry (distinct from the organization's own organization_audit_events
 * row, which adjustOrganizationCredit does not itself write — this
 * route is where the platform-admin audit trail lives for this action).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ organizationId: string }> },
) {
  if (!isAdminPortalEnabled()) {
    return NextResponse.json({ error: "Admin portal is not enabled" }, { status: 403 });
  }

  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await loadAdminMembership(user);
  if (!membership.ok) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { organizationId } = await params;
  const organization = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!organization) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as AdjustCreditsBody | null;
  const quantity = typeof body?.quantity === "number" ? Math.trunc(body.quantity) : NaN;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";

  if (!Number.isFinite(quantity) || quantity === 0) {
    return NextResponse.json({ error: "A non-zero integer quantity is required" }, { status: 400 });
  }
  if (reason.length === 0) {
    return NextResponse.json({ error: "A reason is required" }, { status: 400 });
  }

  const result = await db.transaction(async (tx) => {
    const adjustment = await adjustOrganizationCredit(tx, {
      organizationId: organization.id,
      quantity,
      reason,
      createdByUserId: user.id,
    });
    if (!adjustment.ok) return adjustment;

    await logAdminAction(tx, {
      adminUserId: user.id,
      action: "credit_adjustment",
      targetType: "organization",
      targetId: organization.id,
      metadata: { quantity, reason },
    });

    return adjustment;
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Adjustment would drive the organization's balance below zero" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
