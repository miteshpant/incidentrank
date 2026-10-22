import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { organizationMembers, organizations } from "@incidentrank/db";
import { db } from "@/lib/server/db";
import { getOrCreateCurrentUser } from "@/lib/server/current-user";
import { slugify, randomSlugSuffix } from "@/lib/server/slug";

interface CreateOrganizationBody {
  name?: unknown;
}

export async function POST(request: Request) {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | CreateOrganizationBody
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length === 0) {
    return NextResponse.json(
      { error: "Organization name is required" },
      { status: 400 },
    );
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;

  // Retry on slug collision with a short random suffix — organizations.slug
  // is unique; collisions are expected to be rare but not impossible.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await db.query.organizations.findFirst({
      where: eq(organizations.slug, slug),
    });
    if (!existing) break;
    slug = `${baseSlug}-${randomSlugSuffix()}`;
  }

  const [organization] = await db
    .insert(organizations)
    .values({ name, slug })
    .returning();

  if (!organization) {
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 },
    );
  }

  await db.insert(organizationMembers).values({
    organizationId: organization.id,
    userId: user.id,
    role: "owner",
  });

  return NextResponse.json({ organization });
}

export async function GET() {
  const user = await getOrCreateCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await db.query.organizationMembers.findMany({
    where: eq(organizationMembers.userId, user.id),
    with: { organization: true },
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  return NextResponse.json({
    organizations: memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    })),
  });
}
