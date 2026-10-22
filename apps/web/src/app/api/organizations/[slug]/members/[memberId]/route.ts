import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadOrganizationMembership } from "@/lib/server/organization-auth";
import { changeMemberRole, removeMember } from "@/lib/server/org-membership";

interface PatchMemberBody {
  role?: unknown;
}

const VALID_ROLES = new Set(["owner", "admin", "member"]);

/**
 * Changes a member's role. Authorization (owner-only, per
 * canChangeRole) and the last-owner invariant are both enforced inside
 * changeMemberRole — this route only translates its result codes to
 * HTTP responses, never re-implements the policy.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string; memberId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, memberId } = await params;
  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }

  const body = (await request.json().catch(() => null)) as PatchMemberBody | null;
  const nextRole = typeof body?.role === "string" ? body.role : "";
  if (!VALID_ROLES.has(nextRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const outcome = await changeMemberRole(
    result.organization.id,
    result.membership.role,
    memberId,
    nextRole as "owner" | "admin" | "member",
  );

  if (!outcome.ok) {
    if (outcome.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (outcome.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "An organization must always have at least one owner" },
      { status: 409 },
    );
  }

  return NextResponse.json({ membership: outcome.membership });
}

/**
 * Removes a member from the organization. Authorization (owner/admin
 * per canManageMember) and the last-owner invariant are both enforced
 * inside removeMember.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ slug: string; memberId: string }> },
) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, memberId } = await params;
  const result = await loadOrganizationMembership(slug, user);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "Not found" : "Forbidden" },
      { status: result.status },
    );
  }

  const outcome = await removeMember(result.organization.id, result.membership.role, memberId);

  if (!outcome.ok) {
    if (outcome.reason === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (outcome.reason === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(
      { error: "An organization must always have at least one owner" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
