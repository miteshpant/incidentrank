import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { canInviteMembers, loadOrganizationMembership } from "@/lib/server/organization-auth";
import { revokeOrgInvitation } from "@/lib/server/org-membership";

/**
 * Revokes a pending invitation. owner/admin only. Revoking an already-
 * accepted invitation is rejected (revokeOrgInvitation's "not_pending"
 * reason) — once accepted, membership is authoritative and an
 * invitation must never be used as a substitute for member removal.
 *
 * Deliberately does NOT call requireActiveOrganization (Phase 10A §17):
 * suspension blocks invitation *creation*, not *revocation* — revoking a
 * pending invite reduces standing risk rather than creating new
 * operational state, so an org owner/admin can still clean up a stale
 * invite even while suspended. Documented asymmetry, see the Phase 10A
 * completion report.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; invitationId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, invitationId } = await params;
  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }
  if (!canInviteMembers(result.membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const outcome = await revokeOrgInvitation(result.organization.id, invitationId);
  if (!outcome.ok) {
    if (outcome.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: "This invitation is no longer pending" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
