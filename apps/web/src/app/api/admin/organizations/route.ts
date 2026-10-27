import { NextResponse } from "next/server";
import { and, count, eq } from "drizzle-orm";
import {
  assessments,
  organizationMembers,
  scenarios,
} from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { loadAdminMembership } from "@/lib/server/admin-auth";
import { isAdminPortalEnabled } from "@/lib/server/feature-flags";
import { createOrganization } from "@/lib/server/organization-provisioning";
import { appBaseUrl } from "@/lib/server/app-url";

interface CreateOrganizationBody {
  name?: unknown;
  slug?: unknown;
  ownerEmail?: unknown;
  notes?: unknown;
}

/**
 * Platform-admin organization provisioning (docs/implementation_plan/
 * phase10a.md §3/§32). Both platform owner AND plain platform admin may
 * create organizations — unlike admin-invite creation (owner-only), org
 * provisioning is listed as allowed for both roles in §2's permission
 * table, so this route only needs loadAdminMembership's ok-check, not
 * requirePlatformOwner.
 */
export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as CreateOrganizationBody | null;
  const name = typeof body?.name === "string" ? body.name : "";
  const slug = typeof body?.slug === "string" && body.slug.trim().length > 0 ? body.slug : undefined;
  const ownerEmail = typeof body?.ownerEmail === "string" ? body.ownerEmail : "";
  const notes = typeof body?.notes === "string" ? body.notes : undefined;

  const result = await createOrganization({
    name,
    slug,
    ownerEmail,
    notes,
    createdByAdminUserId: membership.membership.id,
    createdByUserId: user.id,
  });

  if (!result.ok) {
    const error =
      result.reason === "invalid_name"
        ? "Organization name is required"
        : "A valid owner email is required";
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({
    organization: result.organization,
    invitation: {
      email: result.invitation.email,
      expiresAt: result.invitation.expiresAt,
    },
    // The plaintext token is never persisted (only its hash) — this
    // response is the one and only place it can ever be recovered. When
    // emailSent is false, the admin UI must surface this as the invite
    // link, since there is no other channel to deliver it.
    inviteUrl: `${appBaseUrl()}/organization/invite/${result.token}`,
    emailSent: result.emailSent,
  });
}

/**
 * Admin-only organization list (docs/implementation_plan/phase10a.md
 * §4). Operational administration, not an analytics warehouse — counts
 * are simple, unbounded by date range or pagination of the underlying
 * detail, matching the existing admin-table conventions.
 */
export async function GET() {
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

  const orgs = await db.query.organizations.findMany({
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  const rows = await Promise.all(
    orgs.map(async (org) => {
      const [owners, scenarioCount, assessmentCount] = await Promise.all([
        db.query.organizationMembers.findMany({
          where: and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.role, "owner")),
          with: { user: true },
        }),
        db
          .select({ value: count() })
          .from(scenarios)
          .where(eq(scenarios.organizationId, org.id)),
        db
          .select({ value: count() })
          .from(assessments)
          .where(eq(assessments.organizationId, org.id)),
      ]);

      return {
        ...org,
        ownerDisplayNames: owners.map((o) => o.user?.displayName).filter(Boolean),
        scenarioCount: scenarioCount[0]?.value ?? 0,
        assessmentCount: assessmentCount[0]?.value ?? 0,
      };
    }),
  );

  return NextResponse.json({ organizations: rows });
}
